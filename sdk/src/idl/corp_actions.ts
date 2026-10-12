/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/corp_actions.json`.
 */
export type CorpActions = {
  "address": "F9PKgBW9a5ZBH19tM56WQvRWpfQjJvDpt5a6SuejUaFq",
  "metadata": {
    "name": "corpActions",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Morro: corporate actions for tokenized bonds on Solana"
  },
  "instructions": [
    {
      "name": "announce",
      "discriminator": [
        7,
        30,
        100,
        250,
        110,
        253,
        3,
        149
      ],
      "accounts": [
        {
          "name": "issuer",
          "writable": true,
          "signer": true
        },
        {
          "name": "bond",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "bond.mint",
                "account": "bondConfig"
              }
            ]
          }
        },
        {
          "name": "action",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "bond.mint",
                "account": "bondConfig"
              },
              {
                "kind": "account",
                "path": "bond.next_action_id",
                "account": "bondConfig"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "announceArgs"
            }
          }
        }
      ]
    },
    {
      "name": "castVote",
      "discriminator": [
        20,
        212,
        15,
        189,
        69,
        180,
        69,
        151
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "action",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "action.mint",
                "account": "corporateAction"
              },
              {
                "kind": "account",
                "path": "action.action_id",
                "account": "corporateAction"
              }
            ]
          }
        },
        {
          "name": "entitlement",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "action"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "yes",
          "type": "bool"
        }
      ]
    },
    {
      "name": "closeAction",
      "discriminator": [
        68,
        91,
        38,
        183,
        124,
        74,
        239,
        136
      ],
      "accounts": [
        {
          "name": "issuer",
          "writable": true,
          "signer": true
        },
        {
          "name": "bond",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "bond.mint",
                "account": "bondConfig"
              }
            ]
          }
        },
        {
          "name": "action",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "bond.mint",
                "account": "bondConfig"
              },
              {
                "kind": "account",
                "path": "action.action_id",
                "account": "corporateAction"
              }
            ]
          }
        },
        {
          "name": "settlementMint"
        },
        {
          "name": "escrow",
          "docs": [
            "Required for on-chain settlement: emptied and closed."
          ],
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "action"
              }
            ]
          }
        },
        {
          "name": "issuerSettlementAccount",
          "docs": [
            "Receives any escrow remainder (zero when every entitlement was paid)."
          ],
          "writable": true,
          "optional": true
        },
        {
          "name": "settlementTokenProgram"
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "reportHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "confirmPayment",
      "discriminator": [
        221,
        23,
        112,
        126,
        29,
        23,
        159,
        223
      ],
      "accounts": [
        {
          "name": "payingAgent",
          "signer": true
        },
        {
          "name": "bond",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true
        },
        {
          "name": "action",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              },
              {
                "kind": "account",
                "path": "action.action_id",
                "account": "corporateAction"
              }
            ]
          }
        },
        {
          "name": "entitlement",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "action"
              },
              {
                "kind": "account",
                "path": "entitlement.owner",
                "account": "entitlement"
              }
            ]
          }
        },
        {
          "name": "holder",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              },
              {
                "kind": "account",
                "path": "entitlement.owner",
                "account": "entitlement"
              }
            ]
          }
        },
        {
          "name": "holderBondAccount",
          "writable": true,
          "optional": true
        },
        {
          "name": "bondTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "paymentRef",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "distribute",
      "discriminator": [
        191,
        44,
        223,
        207,
        164,
        236,
        126,
        61
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Anyone may push payments once the payment date is reached."
          ],
          "signer": true
        },
        {
          "name": "bond",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true
        },
        {
          "name": "action",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              },
              {
                "kind": "account",
                "path": "action.action_id",
                "account": "corporateAction"
              }
            ]
          }
        },
        {
          "name": "entitlement",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "action"
              },
              {
                "kind": "account",
                "path": "entitlement.owner",
                "account": "entitlement"
              }
            ]
          }
        },
        {
          "name": "holder",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              },
              {
                "kind": "account",
                "path": "entitlement.owner",
                "account": "entitlement"
              }
            ]
          }
        },
        {
          "name": "holderBondAccount",
          "docs": [
            "Required when bonds are retired."
          ],
          "writable": true,
          "optional": true
        },
        {
          "name": "settlementMint"
        },
        {
          "name": "escrow",
          "docs": [
            "Required for on-chain settlement."
          ],
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "action"
              }
            ]
          }
        },
        {
          "name": "holderSettlementAccount",
          "docs": [
            "Required for on-chain settlement."
          ],
          "writable": true,
          "optional": true
        },
        {
          "name": "bondTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "settlementTokenProgram"
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": []
    },
    {
      "name": "finalizeSnapshot",
      "discriminator": [
        164,
        5,
        101,
        146,
        139,
        235,
        67,
        48
      ],
      "accounts": [
        {
          "name": "bond",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "bond.mint",
                "account": "bondConfig"
              }
            ]
          }
        },
        {
          "name": "action",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "bond.mint",
                "account": "bondConfig"
              },
              {
                "kind": "account",
                "path": "action.action_id",
                "account": "corporateAction"
              }
            ]
          }
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": []
    },
    {
      "name": "finalizeVote",
      "discriminator": [
        181,
        176,
        6,
        248,
        249,
        134,
        146,
        56
      ],
      "accounts": [
        {
          "name": "bond",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true
        },
        {
          "name": "action",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              },
              {
                "kind": "account",
                "path": "action.action_id",
                "account": "corporateAction"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": []
    },
    {
      "name": "fundEscrow",
      "discriminator": [
        155,
        18,
        218,
        141,
        182,
        213,
        69,
        201
      ],
      "accounts": [
        {
          "name": "issuer",
          "writable": true,
          "signer": true
        },
        {
          "name": "bond",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "bond.mint",
                "account": "bondConfig"
              }
            ]
          }
        },
        {
          "name": "action",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "bond.mint",
                "account": "bondConfig"
              },
              {
                "kind": "account",
                "path": "action.action_id",
                "account": "corporateAction"
              }
            ]
          }
        },
        {
          "name": "settlementMint"
        },
        {
          "name": "issuerSettlementAccount",
          "writable": true
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "action"
              }
            ]
          }
        },
        {
          "name": "settlementTokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": []
    },
    {
      "name": "initializeBond",
      "discriminator": [
        135,
        182,
        183,
        104,
        169,
        38,
        102,
        147
      ],
      "accounts": [
        {
          "name": "issuer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint"
        },
        {
          "name": "settlementMint"
        },
        {
          "name": "bond",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "extraAccountMetaList",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  120,
                  116,
                  114,
                  97,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116,
                  45,
                  109,
                  101,
                  116,
                  97,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "initBondArgs"
            }
          }
        }
      ]
    },
    {
      "name": "issue",
      "discriminator": [
        190,
        1,
        98,
        214,
        81,
        99,
        222,
        247
      ],
      "accounts": [
        {
          "name": "issuer",
          "signer": true
        },
        {
          "name": "bond",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true
        },
        {
          "name": "holder",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              },
              {
                "kind": "account",
                "path": "holder.owner",
                "account": "holderRecord"
              }
            ]
          }
        },
        {
          "name": "holderTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "registerHolder",
      "discriminator": [
        113,
        111,
        117,
        246,
        175,
        59,
        98,
        161
      ],
      "accounts": [
        {
          "name": "registrar",
          "writable": true,
          "signer": true
        },
        {
          "name": "bond",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "bond.mint",
                "account": "bondConfig"
              }
            ]
          }
        },
        {
          "name": "owner"
        },
        {
          "name": "holder",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "bond.mint",
                "account": "bondConfig"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": []
    },
    {
      "name": "setHolderStatus",
      "discriminator": [
        121,
        5,
        238,
        79,
        85,
        126,
        216,
        174
      ],
      "accounts": [
        {
          "name": "registrar",
          "signer": true
        },
        {
          "name": "bond",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "bond.mint",
                "account": "bondConfig"
              }
            ]
          }
        },
        {
          "name": "holder",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "bond.mint",
                "account": "bondConfig"
              },
              {
                "kind": "account",
                "path": "holder.owner",
                "account": "holderRecord"
              }
            ]
          }
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "kycApproved",
          "type": "bool"
        },
        {
          "name": "frozen",
          "type": "bool"
        }
      ]
    },
    {
      "name": "snapshotHolder",
      "discriminator": [
        33,
        225,
        166,
        163,
        73,
        94,
        167,
        96
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Anyone may run the snapshot; the payer only funds the Entitlement account."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "bond",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "bond.mint",
                "account": "bondConfig"
              }
            ]
          }
        },
        {
          "name": "action",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "bond.mint",
                "account": "bondConfig"
              },
              {
                "kind": "account",
                "path": "action.action_id",
                "account": "corporateAction"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "action"
          ]
        },
        {
          "name": "holder",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "bond.mint",
                "account": "bondConfig"
              },
              {
                "kind": "account",
                "path": "holder.owner",
                "account": "holderRecord"
              }
            ]
          }
        },
        {
          "name": "entitlement",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "action"
              },
              {
                "kind": "account",
                "path": "holder.owner",
                "account": "holderRecord"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": []
    },
    {
      "name": "transferHook",
      "docs": [
        "Token-2022 transfer hook: KYC check on the receiver and balance checkpoints."
      ],
      "discriminator": [
        105,
        37,
        101,
        197,
        75,
        251,
        102,
        26
      ],
      "accounts": [
        {
          "name": "sourceToken"
        },
        {
          "name": "mint"
        },
        {
          "name": "destinationToken"
        },
        {
          "name": "authority"
        },
        {
          "name": "extraAccountMetaList",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  120,
                  116,
                  114,
                  97,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116,
                  45,
                  109,
                  101,
                  116,
                  97,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "bond",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "sourceHolder",
          "writable": true
        },
        {
          "name": "destinationHolder",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "bondConfig",
      "discriminator": [
        142,
        20,
        216,
        1,
        7,
        142,
        247,
        125
      ]
    },
    {
      "name": "corporateAction",
      "discriminator": [
        144,
        225,
        182,
        199,
        4,
        234,
        12,
        32
      ]
    },
    {
      "name": "entitlement",
      "discriminator": [
        220,
        250,
        27,
        244,
        55,
        49,
        74,
        154
      ]
    },
    {
      "name": "holderRecord",
      "discriminator": [
        215,
        67,
        31,
        41,
        155,
        251,
        178,
        128
      ]
    }
  ],
  "events": [
    {
      "name": "actionAnnounced",
      "discriminator": [
        183,
        193,
        90,
        98,
        193,
        99,
        3,
        0
      ]
    },
    {
      "name": "actionClosed",
      "discriminator": [
        12,
        207,
        175,
        173,
        7,
        142,
        107,
        78
      ]
    },
    {
      "name": "bondInitialized",
      "discriminator": [
        73,
        68,
        161,
        2,
        214,
        12,
        169,
        53
      ]
    },
    {
      "name": "bondsIssued",
      "discriminator": [
        151,
        56,
        248,
        249,
        219,
        123,
        198,
        149
      ]
    },
    {
      "name": "bondsRetired",
      "discriminator": [
        7,
        184,
        19,
        197,
        147,
        96,
        51,
        226
      ]
    },
    {
      "name": "entitlementPaid",
      "discriminator": [
        12,
        205,
        37,
        164,
        180,
        249,
        36,
        79
      ]
    },
    {
      "name": "escrowFunded",
      "discriminator": [
        228,
        243,
        166,
        74,
        22,
        167,
        157,
        244
      ]
    },
    {
      "name": "holderRegistered",
      "discriminator": [
        201,
        78,
        223,
        133,
        103,
        164,
        173,
        136
      ]
    },
    {
      "name": "holderSnapshotted",
      "discriminator": [
        150,
        155,
        26,
        183,
        44,
        30,
        104,
        143
      ]
    },
    {
      "name": "holderStatusChanged",
      "discriminator": [
        155,
        49,
        30,
        66,
        101,
        18,
        34,
        6
      ]
    },
    {
      "name": "paymentConfirmed",
      "discriminator": [
        196,
        8,
        147,
        26,
        213,
        102,
        158,
        183
      ]
    },
    {
      "name": "paymentInstructed",
      "discriminator": [
        215,
        219,
        25,
        147,
        92,
        190,
        122,
        44
      ]
    },
    {
      "name": "snapshotFinalized",
      "discriminator": [
        17,
        215,
        152,
        185,
        112,
        229,
        188,
        101
      ]
    },
    {
      "name": "termsAmended",
      "discriminator": [
        165,
        218,
        140,
        238,
        243,
        240,
        147,
        185
      ]
    },
    {
      "name": "voteCast",
      "discriminator": [
        39,
        53,
        195,
        104,
        188,
        17,
        225,
        213
      ]
    },
    {
      "name": "voteFinalized",
      "discriminator": [
        183,
        215,
        21,
        9,
        39,
        161,
        211,
        42
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidMint",
      "msg": "Mint must have 0 decimals and zero supply"
    },
    {
      "code": 6001,
      "name": "invalidMintAuthority",
      "msg": "Mint authority must be the bond PDA"
    },
    {
      "code": 6002,
      "name": "invalidTransferHook",
      "msg": "Mint transfer hook must point to this program"
    },
    {
      "code": 6003,
      "name": "invalidPermanentDelegate",
      "msg": "Mint permanent delegate must be the bond PDA"
    },
    {
      "code": 6004,
      "name": "invalidBondTerms",
      "msg": "Invalid bond terms"
    },
    {
      "code": 6005,
      "name": "notIssuer",
      "msg": "Signer is not the issuer"
    },
    {
      "code": 6006,
      "name": "notRegistrar",
      "msg": "Signer is not the registrar"
    },
    {
      "code": 6007,
      "name": "notPayingAgent",
      "msg": "Signer is not the paying agent"
    },
    {
      "code": 6008,
      "name": "holderNotApproved",
      "msg": "Holder is not KYC-approved"
    },
    {
      "code": 6009,
      "name": "holderFrozen",
      "msg": "Holder is frozen"
    },
    {
      "code": 6010,
      "name": "receiverNotApproved",
      "msg": "Receiver is not a KYC-approved holder"
    },
    {
      "code": 6011,
      "name": "bondNotActive",
      "msg": "Bond is no longer active"
    },
    {
      "code": 6012,
      "name": "transfersLocked",
      "msg": "Transfers are locked for an open redemption"
    },
    {
      "code": 6013,
      "name": "notTransferring",
      "msg": "Hook called outside a token transfer"
    },
    {
      "code": 6014,
      "name": "invalidActionParams",
      "msg": "Invalid action parameters"
    },
    {
      "code": 6015,
      "name": "recordDateInPast",
      "msg": "Record date must be in the future"
    },
    {
      "code": 6016,
      "name": "redemptionAlreadyOpen",
      "msg": "Another redemption is already open"
    },
    {
      "code": 6017,
      "name": "tooManyOpenActions",
      "msg": "Too many actions awaiting a snapshot"
    },
    {
      "code": 6018,
      "name": "checkpointHistoryFull",
      "msg": "Balance history is full and still needed by an open record date; finalize that snapshot first"
    },
    {
      "code": 6019,
      "name": "recordDateNotReached",
      "msg": "Record date has not passed yet"
    },
    {
      "code": 6020,
      "name": "invalidActionStatus",
      "msg": "Action is not in the required state"
    },
    {
      "code": 6021,
      "name": "noBalanceAtRecord",
      "msg": "Holder had no bonds at the record date"
    },
    {
      "code": 6022,
      "name": "snapshotIncomplete",
      "msg": "Snapshot is incomplete: snapshotted balance does not equal supply at record date"
    },
    {
      "code": 6023,
      "name": "notAPaymentAction",
      "msg": "Action does not pay cash"
    },
    {
      "code": 6024,
      "name": "wrongSettlementMode",
      "msg": "Wrong settlement mode for this instruction"
    },
    {
      "code": 6025,
      "name": "paymentDateNotReached",
      "msg": "Payment date has not been reached"
    },
    {
      "code": 6026,
      "name": "invalidEntitlementStatus",
      "msg": "Entitlement is not in the required state"
    },
    {
      "code": 6027,
      "name": "missingAccount",
      "msg": "A required account is missing"
    },
    {
      "code": 6028,
      "name": "wrongTokenAccount",
      "msg": "Token account does not belong to the holder"
    },
    {
      "code": 6029,
      "name": "settlementIncomplete",
      "msg": "Not every entitlement has been settled"
    },
    {
      "code": 6030,
      "name": "votingClosed",
      "msg": "Voting is closed"
    },
    {
      "code": 6031,
      "name": "votingOpen",
      "msg": "Voting is still open"
    },
    {
      "code": 6032,
      "name": "alreadyVoted",
      "msg": "Holder has already voted"
    },
    {
      "code": 6033,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    }
  ],
  "types": [
    {
      "name": "actionAnnounced",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "action",
            "type": "pubkey"
          },
          {
            "name": "actionId",
            "type": "u32"
          },
          {
            "name": "kind",
            "type": {
              "defined": {
                "name": "actionKind"
              }
            }
          },
          {
            "name": "recordTs",
            "type": "i64"
          },
          {
            "name": "paymentTs",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "actionClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "action",
            "type": "pubkey"
          },
          {
            "name": "totalPaid",
            "type": "u64"
          },
          {
            "name": "totalRetired",
            "type": "u64"
          },
          {
            "name": "reportHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "actionKind",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "coupon"
          },
          {
            "name": "redemption"
          },
          {
            "name": "partialRedemption"
          },
          {
            "name": "vote"
          }
        ]
      }
    },
    {
      "name": "actionStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "announced"
          },
          {
            "name": "snapshotted"
          },
          {
            "name": "funded"
          },
          {
            "name": "paying"
          },
          {
            "name": "closed"
          },
          {
            "name": "voting"
          },
          {
            "name": "passed"
          },
          {
            "name": "rejected"
          }
        ]
      }
    },
    {
      "name": "announceArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "kind",
            "type": {
              "defined": {
                "name": "actionKind"
              }
            }
          },
          {
            "name": "settlementMode",
            "type": {
              "defined": {
                "name": "settlementMode"
              }
            }
          },
          {
            "name": "recordTs",
            "type": "i64"
          },
          {
            "name": "paymentTs",
            "type": "i64"
          },
          {
            "name": "periodStartTs",
            "type": "i64"
          },
          {
            "name": "periodEndTs",
            "type": "i64"
          },
          {
            "name": "redeemBps",
            "type": "u16"
          },
          {
            "name": "newMaturityTs",
            "type": "i64"
          },
          {
            "name": "quorumBps",
            "type": "u16"
          },
          {
            "name": "thresholdBps",
            "type": "u16"
          },
          {
            "name": "voteEndTs",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "bondConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "issuer",
            "type": "pubkey"
          },
          {
            "name": "registrar",
            "type": "pubkey"
          },
          {
            "name": "payingAgent",
            "type": "pubkey"
          },
          {
            "name": "settlementMint",
            "type": "pubkey"
          },
          {
            "name": "faceValue",
            "docs": [
              "Face value per bond, in settlement-token minor units (tiyn)."
            ],
            "type": "u64"
          },
          {
            "name": "couponRateBps",
            "type": "u32"
          },
          {
            "name": "couponFreq",
            "type": "u8"
          },
          {
            "name": "dayCount",
            "type": {
              "defined": {
                "name": "dayCount"
              }
            }
          },
          {
            "name": "issueTs",
            "type": "i64"
          },
          {
            "name": "maturityTs",
            "type": "i64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "bondStatus"
              }
            }
          },
          {
            "name": "transferLockTs",
            "docs": [
              "Non-zero while a redemption is open: transfers are rejected from this time on."
            ],
            "type": "i64"
          },
          {
            "name": "nextActionId",
            "type": "u32"
          },
          {
            "name": "supply",
            "type": "u64"
          },
          {
            "name": "holderCount",
            "type": "u32"
          },
          {
            "name": "pendingRecordTs",
            "docs": [
              "Record dates whose snapshot is not finalized yet (0 = empty slot)."
            ],
            "type": {
              "array": [
                "i64",
                8
              ]
            }
          },
          {
            "name": "supplyHistory",
            "type": {
              "defined": {
                "name": "checkpoints"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "bondInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "issuer",
            "type": "pubkey"
          },
          {
            "name": "faceValue",
            "type": "u64"
          },
          {
            "name": "couponRateBps",
            "type": "u32"
          },
          {
            "name": "maturityTs",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "bondStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "active"
          },
          {
            "name": "redeemed"
          }
        ]
      }
    },
    {
      "name": "bondsIssued",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "supply",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "bondsRetired",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "action",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "supply",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "checkpoint",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "ts",
            "type": "i64"
          },
          {
            "name": "value",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "checkpoints",
      "docs": [
        "Time-ordered history of a value (a holder's balance or the bond's supply)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "len",
            "type": "u8"
          },
          {
            "name": "items",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "checkpoint"
                  }
                },
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "corporateAction",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "actionId",
            "type": "u32"
          },
          {
            "name": "kind",
            "type": {
              "defined": {
                "name": "actionKind"
              }
            }
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "actionStatus"
              }
            }
          },
          {
            "name": "settlementMode",
            "type": {
              "defined": {
                "name": "settlementMode"
              }
            }
          },
          {
            "name": "recordTs",
            "type": "i64"
          },
          {
            "name": "paymentTs",
            "type": "i64"
          },
          {
            "name": "periodStartTs",
            "docs": [
              "Coupon accrual period; equal values mean no coupon (e.g. partial redemption)."
            ],
            "type": "i64"
          },
          {
            "name": "periodEndTs",
            "type": "i64"
          },
          {
            "name": "redeemBps",
            "docs": [
              "Share of each holding retired, in bps (10,000 for a full redemption)."
            ],
            "type": "u16"
          },
          {
            "name": "newMaturityTs",
            "type": "i64"
          },
          {
            "name": "quorumBps",
            "type": "u16"
          },
          {
            "name": "thresholdBps",
            "type": "u16"
          },
          {
            "name": "voteEndTs",
            "type": "i64"
          },
          {
            "name": "supplyAtRecord",
            "type": "u64"
          },
          {
            "name": "snapshottedBalance",
            "type": "u64"
          },
          {
            "name": "holdersSnapshotted",
            "type": "u32"
          },
          {
            "name": "holdersSettled",
            "type": "u32"
          },
          {
            "name": "totalEntitlement",
            "type": "u64"
          },
          {
            "name": "totalPaid",
            "type": "u64"
          },
          {
            "name": "totalRetired",
            "type": "u64"
          },
          {
            "name": "votesYes",
            "type": "u64"
          },
          {
            "name": "votesNo",
            "type": "u64"
          },
          {
            "name": "snapshotDigest",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "reportHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "announcedTs",
            "type": "i64"
          },
          {
            "name": "closedTs",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "dayCount",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "thirty360"
          },
          {
            "name": "act365"
          }
        ]
      }
    },
    {
      "name": "entitlement",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "action",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "balanceAtRecord",
            "type": "u64"
          },
          {
            "name": "amount",
            "docs": [
              "Cash owed, in settlement-token minor units."
            ],
            "type": "u64"
          },
          {
            "name": "bondsToRetire",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "entitlementStatus"
              }
            }
          },
          {
            "name": "settledTs",
            "type": "i64"
          },
          {
            "name": "paymentRef",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "vote",
            "type": {
              "defined": {
                "name": "voteChoice"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "entitlementPaid",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "action",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "entitlementStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "pending"
          },
          {
            "name": "instructed"
          },
          {
            "name": "paid"
          }
        ]
      }
    },
    {
      "name": "escrowFunded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "action",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "holderRecord",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "kycApproved",
            "type": "bool"
          },
          {
            "name": "frozen",
            "type": "bool"
          },
          {
            "name": "balance",
            "type": "u64"
          },
          {
            "name": "history",
            "type": {
              "defined": {
                "name": "checkpoints"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "holderRegistered",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "holderSnapshotted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "action",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "balanceAtRecord",
            "type": "u64"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "bondsToRetire",
            "type": "u64"
          },
          {
            "name": "digest",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "holderStatusChanged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "kycApproved",
            "type": "bool"
          },
          {
            "name": "frozen",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "initBondArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "faceValue",
            "type": "u64"
          },
          {
            "name": "couponRateBps",
            "type": "u32"
          },
          {
            "name": "couponFreq",
            "type": "u8"
          },
          {
            "name": "dayCount",
            "type": {
              "defined": {
                "name": "dayCount"
              }
            }
          },
          {
            "name": "issueTs",
            "type": "i64"
          },
          {
            "name": "maturityTs",
            "type": "i64"
          },
          {
            "name": "registrar",
            "type": "pubkey"
          },
          {
            "name": "payingAgent",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "paymentConfirmed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "action",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "paymentRef",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "paymentInstructed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "action",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "settlementMode",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "onChain"
          },
          {
            "name": "offChain"
          }
        ]
      }
    },
    {
      "name": "snapshotFinalized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "action",
            "type": "pubkey"
          },
          {
            "name": "supplyAtRecord",
            "type": "u64"
          },
          {
            "name": "holders",
            "type": "u32"
          },
          {
            "name": "totalEntitlement",
            "type": "u64"
          },
          {
            "name": "digest",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "termsAmended",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "action",
            "type": "pubkey"
          },
          {
            "name": "oldMaturityTs",
            "type": "i64"
          },
          {
            "name": "newMaturityTs",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "voteCast",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "action",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "yes",
            "type": "bool"
          },
          {
            "name": "weight",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "voteChoice",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "none"
          },
          {
            "name": "yes"
          },
          {
            "name": "no"
          }
        ]
      }
    },
    {
      "name": "voteFinalized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "action",
            "type": "pubkey"
          },
          {
            "name": "votesYes",
            "type": "u64"
          },
          {
            "name": "votesNo",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "actionStatus"
              }
            }
          }
        ]
      }
    }
  ]
};
