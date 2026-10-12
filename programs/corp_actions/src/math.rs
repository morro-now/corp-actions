use anchor_lang::prelude::*;

use crate::error::MorroError;
use crate::state::{ActionKind, CorporateAction, DayCount, BPS};

const SECONDS_PER_DAY: i64 = 86_400;

/// Converts days since 1970-01-01 to a (year, month, day) civil date.
/// Howard Hinnant's algorithm, valid for the proleptic Gregorian calendar.
pub fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

pub fn date_from_ts(ts: i64) -> (i64, u32, u32) {
    civil_from_days(ts.div_euclid(SECONDS_PER_DAY))
}

pub fn format_date(ts: i64) -> String {
    let (y, m, d) = date_from_ts(ts);
    format!("{y:04}-{m:02}-{d:02}")
}

/// Day-count fraction of the period as (numerator, denominator).
pub fn day_count_fraction(start_ts: i64, end_ts: i64, convention: DayCount) -> (u64, u64) {
    if end_ts <= start_ts {
        return (0, 1);
    }
    match convention {
        DayCount::Thirty360 => {
            let (y1, m1, mut d1) = date_from_ts(start_ts);
            let (y2, m2, mut d2) = date_from_ts(end_ts);
            if d1 == 31 {
                d1 = 30;
            }
            if d2 == 31 && d1 == 30 {
                d2 = 30;
            }
            let days = 360 * (y2 - y1) + 30 * (m2 as i64 - m1 as i64) + (d2 as i64 - d1 as i64);
            (days.max(0) as u64, 360)
        }
        DayCount::Act365 => (((end_ts - start_ts) / SECONDS_PER_DAY) as u64, 365),
    }
}

/// floor(bonds × face × rate_bps × num / (10,000 × den)), computed in u128.
pub fn coupon_amount(bonds: u64, face_value: u64, rate_bps: u32, num: u64, den: u64) -> Result<u64> {
    let numerator = (bonds as u128)
        .checked_mul(face_value as u128)
        .and_then(|v| v.checked_mul(rate_bps as u128))
        .and_then(|v| v.checked_mul(num as u128))
        .ok_or(MorroError::MathOverflow)?;
    let value = numerator / (BPS as u128 * den as u128);
    u64::try_from(value).map_err(|_| MorroError::MathOverflow.into())
}

/// Cash owed and bonds to retire for a holder with `balance` bonds at the record date.
pub fn entitlement_for(
    action: &CorporateAction,
    balance: u64,
    face_value: u64,
    rate_bps: u32,
    day_count: DayCount,
) -> Result<(u64, u64)> {
    let (num, den) = day_count_fraction(action.period_start_ts, action.period_end_ts, day_count);
    let coupon = |bonds: u64| coupon_amount(bonds, face_value, rate_bps, num, den);
    let principal = |bonds: u64| {
        bonds
            .checked_mul(face_value)
            .ok_or_else(|| error!(MorroError::MathOverflow))
    };
    match action.kind {
        ActionKind::Coupon => Ok((coupon(balance)?, 0)),
        ActionKind::Redemption => {
            let amount = principal(balance)?
                .checked_add(coupon(balance)?)
                .ok_or(MorroError::MathOverflow)?;
            Ok((amount, balance))
        }
        ActionKind::PartialRedemption => {
            let retire = ((balance as u128 * action.redeem_bps as u128) / BPS as u128) as u64;
            let amount = principal(retire)?
                .checked_add(coupon(balance)?)
                .ok_or(MorroError::MathOverflow)?;
            Ok((amount, retire))
        }
        ActionKind::Vote => Ok((0, 0)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // 2026-04-15T00:00:00Z and 2026-10-15T00:00:00Z
    const APR_15: i64 = 1_776_211_200;
    const OCT_15: i64 = 1_792_022_400;

    #[test]
    fn civil_dates() {
        assert_eq!(date_from_ts(0), (1970, 1, 1));
        assert_eq!(date_from_ts(APR_15), (2026, 4, 15));
        assert_eq!(format_date(OCT_15), "2026-10-15");
    }

    #[test]
    fn thirty_360_half_year() {
        assert_eq!(day_count_fraction(APR_15, OCT_15, DayCount::Thirty360), (180, 360));
    }

    #[test]
    fn act_365_half_year() {
        assert_eq!(day_count_fraction(APR_15, OCT_15, DayCount::Act365), (183, 365));
    }

    #[test]
    fn worked_example_from_design_doc() {
        // 12,000 bonds, face 1,000 KZT (100,000 tiyn), 14.50%, 180/360 → 870,000.00 KZT
        assert_eq!(coupon_amount(12_000, 100_000, 1_450, 180, 360).unwrap(), 87_000_000);
        // Act/365, 182 days → 867,616.43 KZT (fraction of a tiyn dropped)
        assert_eq!(coupon_amount(12_000, 100_000, 1_450, 182, 365).unwrap(), 86_761_643);
    }
}
