# dcent-web-connector v2 — Per-Family Payload Contract

> 🇰🇷 한국어: [v2-payload-contract-ko.md](v2-payload-contract-ko.md)

This document specifies the `payload` shape each chain family expects on the v2 unified sign API.

```js
const result = await dcent.sign({
  method: 'signTransaction',  // or 'signMessage' / 'signTypedData' / ...
  chainId: 'eip155:1/slip44:60',
  payload: {
    keyPath: "m/44'/60'/0'/0/0",   // ⚠️ keyPath lives inside payload (required)
    transaction: { /* family-specific shape */ }
  }
})
```

**Source of truth:** `playground/chains.json` (family → chainId map) + `playground/presets.*.json` (payload shape examples).

> **Support status is measured, not assumed** (2026-07-21, swproxy harness — signMessage across all 152 chains / signTransaction over 86 presets · 367 cases).
>
> - ✅ — reached signing
> - ◐ — the path exists but the current example payload does not reach signing (reason per section). **This is not "unsupported"**
> - ❌ `-32601` — the **only trustworthy signal** that the bridge does not support that method
>
> `-32602` does not mean unsupported — it means the **payload is incomplete**. The bridge signs with no network access, so
> consensus fields such as nonce · sequence · fee · blockhash must be filled in by your app (see each family section).

---

## Support status summary

| Family | signTransaction | signMessage | Measured notes |
|--------|----------------|-------------|------|
| algorand | ✅ | ❌ `-32601` | payment / ASA / ASA descriptor signed |
| bitcoin | ◐ | ❌ `-32601` | harness could not build real-account UTXOs, so signing was not reached (prevout mismatch) |
| cardano | ✅ | ❌ `-32601` | 10 full-CBOR presets signed |
| conflux | ◐ | ❌ `-32601` | needs `storageLimit` / `epochHeight` filled in |
| constellation | ✅ | ❌ `-32601` | supported metagraph (DOR) signed. An unsupported metagraph returns `-32602` |
| cosmos | ✅ | ❌ `-32601` | 7 Amino presets signed |
| ethereum | ✅ | ✅ | signMessage signed on 91 of 94 chains. **Only XDC (`eip155:50/51`) returns `-32601`** |
| fil | ✅ | ❌ `-32601` | |
| havah | ✅ (EVM-compatible) | ❌ `-32601` | EVM-compatible, but signMessage is not supported |
| hedera | ✅ | ❌ `-32601` | `extra.unsignedTxBytes` passthrough signed. The structured form returns `-32602` |
| klaytn (Kaia) | ✅ | ✅ | handled by the ethereum family |
| near | ◐ | ❌ `-32601` | the example `publicKey` differs from the device-derived key, so signing was not reached |
| polkadot | ✅ (`extra.scaleHex`) | ✅ parachain / ❌ relay `-32601` | only the relay chain (Polkadot) lacks signMessage |
| solana | ✅ | ✅ | form-D descriptor signed |
| stacks | ✅ | ❌ `-32601` | |
| stellar | ✅ (`{xdr}`) | ✅ | structured ops on the wallet allowlist are signed. Soroban `invokeHostFunction` additionally needs `sorobanData` and is still rejected |
| tezos | ◐ | ❌ `-32601` | requires a pre-forged `extra.unsignedTxBytes` |
| tron | ✅ | ❌ `-32601` | TRX / TRC20 transfer / approve signed |
| vechain | ✅ | ❌ `-32601` | |
| xahau | ◐ | ❌ `-32601` | needs `Sequence` / `LastLedgerSequence` filled into `tx_json` |
| xrp | ◐ | ❌ `-32601` | same (Payment / AccountSet / TrustSet are none of them `-32601`) |

---

## Payload contract by family

### Algorand

**Support:** `signTransaction` ✅ | `signMessage` ❌ `-32601`

**Example chainId:** `algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k/slip44:283`

**signTransaction payload:**

```js
// Source: playground/presets.rest.json → algo-payment
{
  transaction: {
    type: 'pay',
    from: 'ALGORANDADDRESS...',
    to: 'ALGORANDADDRESS...',
    amount: 1000000,       // microAlgo (1 ALGO = 1,000,000)
    fee: 1000,
    firstRound: 1,
    lastRound: 1001,
    genesisID: 'mainnet-v1.0',
    genesisHash: 'wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiHc0CYz/uo='
  }
}
```

---

### Bitcoin

**Support:** `signTransaction` ◐ path exists | `signMessage` ❌ `-32601`

Bitcoin signs through `dcent.sign({ method: 'signTransaction', chainId, payload })`. `payload.transaction` is a UTXO structure of `inputs[]` + `outputs[]`, and `payload.addressFormat` (`legacy` / `segwit-native` — the same enum as `getAddress`) selects which account signs (**availability**: the bridge only reads this field from the release that ships wallet-models with `SignTransactionFromWireParams.addressFormat`; earlier deployments ignore it and fall back to the `inputs[].txType` inference below), because legacy and segwit share one `chainId` **and** one `m/44'` keyPath. Omit it and the variant falls back to each input's `txType` (`p2pkh` = legacy / `p2wpkh` = native segwit); that fallback is absent from PSBT payloads. Outputs additionally accept `txType: 'p2tr'` for Taproot recipients (inputs do not — spending a Taproot UTXO is not supported). A stateful builder (`getBitcoinTransactionObject` + `addBitcoinTransactionInput`/`addBitcoinTransactionOutput`) is available as an alternative.

```js
{
  transaction: {
    inputs: [{ rawTransaction: '<prev tx hex>', index: 0, txType: 'p2pkh', keyPath: "m/44'/0'/0'/0/0" }],
    outputs: [{ txType: 'p2pkh', amount: 990000, addresses: ['<recipient>'] }]
  }
}
```

**Example chainId:** `bip122:000000000019d6689c085ae165831e93/slip44:0` (BTC mainnet)

**Source:** `playground/presets.bitcoin-tx.json`

**Horizen (ZEN) — discontinued chain:** the native ZEN chain was **shut down by the 2025-07-23 migration to a Base ERC-20** (both the old mainchain and the EON EVM chain are discontinued). Existing ZEN balances moved to an ERC-20 on Base, and the claim is a snapshot based on wallet message signing — it does not require a legacy-chain transaction.

`signTransaction` against `bip122:0007104ccda289427919efc39dc9e4d4/slip44:121` is therefore **no longer supported**. The BIP-115 `option` (block hash + height) spec this document used to describe was specific to that chain, so it was removed with it.

> The chain itself is closed, so even a successful signature has nowhere to broadcast. ZEN on Base is an ordinary ERC-20 — use the **Ethereum family path (`eip155:8453`)**.

**ZCASH also requires `option`** (changed 2026-08-03 — the wallet used to fill it in automatically). ZCASH's option is a consensus branch ID, and that value changes at every network-upgrade activation height. The signer does not know the current block height, so **any hardcoded value becomes wrong the moment an activation boundary is crossed** — in practice the previous automatic assembly kept signing with the stale NU6.2 branch after NU6.3 activated. The signature looks fine and is only rejected at broadcast, so the cause never surfaces.

`option` is a value you build **during the prepare step**. The wallet library's `getZCASHOption(currency)` reads the current height and builds it, so pass its result through unchanged. The format is **exactly 16 hex characters** (`GroupId8 + branchId8`). The first 8 must match that chain's `GroupId` and the last 8 must be a known consensus branch ID (if either is off you get `-32602`) — the device uses the first half as the `nVersionGroupId` of both the signing target and the final transaction, and the second half as the sighash personalization.

---

### Cardano

**Support:** `signTransaction` ✅ (full-CBOR) | `signMessage` ❌ `-32601`

**Example chainId:** `cip34:1-764824073` (mainnet), `cip34:0-2` (testnet)

**signTransaction payload (structured — ORDINARY_TRANSACTION):**

```js
// Source: playground/presets.non-evm.json → ada-structured-signtx-ordinary
{
  transaction: {
    signingMode: 'ORDINARY_TRANSACTION',
    inputs: [ /* { txHashHex, outputIndex, ... } */ ],
    outputs: [ /* { address, amount, ... } */ ],
    fee: '170000',           // lovelace
    ttl: '100000',
    networkId: 1,            // 1 = mainnet, 0 = testnet
    protocolMagic: 764824073
  }
}
```

**signTransaction payload (full-CBOR, preferred):**

```js
// Full CBOR hex — handles any transaction type
{
  transaction: {
    txCbor: '0x84a500...'   // CBOR-serialized transaction hex
  }
}
```

---

### Conflux

**Support:** `signTransaction` ◐ path exists | `signMessage` ❌ `-32601`

**Example chainId:** `conflux:cfx/slip44:503`

**signTransaction payload:**

```js
// Source: playground/presets.rest.json → cfx-transfer
// ⚠️ Conflux Core Space requires a CIP-37 base32 address (cfx:...) — a hex (0x) address is a device error
{
  transaction: {
    from: 'cfx:aar...',
    to: 'cfx:aar...',
    value: '0x2386f26fc10000',
    gas: '0x5208',
    gasPrice: '0x174876E800',
    nonce: '0x1',
    data: '0x',
    chainId: '0x405',          // Conflux mainnet (1029, hex string)
    epochHeight: 100000,       // required
    storageLimit: 0            // required
  }
}
```

---

### Constellation

**Support:** `signTransaction` ✅ | `signMessage` ❌ `-32601`

> Measured — transfers on a supported metagraph (e.g. DOR) are signed. An unsupported metagraph id returns `-32602` (no gateway endpoint).

**Example chainId:** `constellation:mainnet/slip44:1137`

**signTransaction payload:**

```js
// Source: playground/presets.non-evm.json → dag-transfer
{
  transaction: {
    source: 'DAG...',
    destination: 'DAG...',
    amount: 100000000,   // 1 DAG = 100,000,000
    fee: 0
  }
}
```

---

### Cosmos

**Support:** `signTransaction` ✅ | `signMessage` ❌ `-32601`

**Example chainId:** `cosmos:cosmoshub-4/slip44:118`, `cosmos:coreum-mainnet-1/slip44:990`

**signTransaction payload (Amino SignDoc — only a single bank `MsgSend` is supported):**

```js
// Source: playground/presets.rest.json → atom-transfer
// ⚠️ Amino form (snake_case) is required. Only a single MsgSend can be signed —
//    CW20 / IBC MsgTransfer / multiple messages / other typeUrls return -32601.
//    (The Protobuf SIGN_MODE_DIRECT form is supported separately via the bodyBytes field)
{
  transaction: {
    msgs: [{
      type: 'cosmos-sdk/MsgSend',
      value: {
        from_address: 'cosmos1...',
        to_address: 'cosmos1...',
        amount: [{ denom: 'uatom', amount: '10000' }]
      }
    }],
    fee: { amount: [{ denom: 'uatom', amount: '5000' }], gas: '200000' },
    memo: '',
    chain_id: 'cosmoshub-4',
    account_number: '1',
    sequence: '1'
  }
}
```

---

### Ethereum

**Support:** `signTransaction` ✅ | `signMessage` ✅

**Example chainId:** `eip155:1/slip44:60` (mainnet), `eip155:8217/slip44:60` (Kaia)

**signTransaction payload (EIP-1559, type 2):**

```js
// Source: playground/presets.evm.json → evm-transfer-1559
{
  transaction: {
    type: 2,
    to: '0x0000000000000000000000000000000000000000',
    value: '0x2386f26fc10000',          // 0.01 ETH in wei
    gasLimit: '0x5208',
    maxFeePerGas: '0x77359400',
    maxPriorityFeePerGas: '0x3b9aca00',
    nonce: '0x0',
    data: '0x'
  }
}
```

**signTransaction payload (legacy, type 0):**

```js
{
  transaction: {
    type: 0,
    to: '0x...',
    value: '0x...',
    gasLimit: '0x...',
    gasPrice: '0x...',
    nonce: '0x...',
    data: '0x'
  }
}
```

**signMessage payload:**

```js
// method: 'signMessage'  (payload.message = hex-encoded bytes)
{ message: '0x48656c6c6f' }

// method: 'signTypedData'  (EIP-712) — payload.data is a JSON.stringify'd string, sent with a version
{
  data: JSON.stringify({
    types: { EIP712Domain: [/*...*/], Transfer: [/*...*/] },
    domain: { name: '...', version: '1', chainId: 1 },
    primaryType: 'Transfer',
    message: { to: '0x...', amount: '1000' }
  }),
  version: 'V4'
}
```

---

### Fil

**Support:** `signTransaction` ✅ | `signMessage` ❌ `-32601`

**Example chainId:** `fil:f/slip44:461`

**signTransaction payload (Lotus Message):**

```js
// Source: playground/presets.rest.json → fil-transfer
{
  transaction: {
    to: 'f1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaahaui6xa',
    from: 'f1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaahaui6xa',
    nonce: 1,
    value: '1000000000000000000',   // attoFIL (1 FIL = 10^18)
    gasLimit: 1000000,
    gasFeeCap: '100000',
    gasPremium: '100000',
    method: 0,
    params: ''
  }
}
```

---

### Havah

**Support:** `signTransaction` ✅ (EVM-compatible) | `signMessage` ❌ `-32601`

**Example chainId:** `havah:mainnet/slip44:858` (mainnet), `havah:testnet/slip44:858` (testnet)

**signTransaction payload:** identical to the EVM shape (see the Ethereum section)

---

### Hedera

**Support:** `signTransaction` ✅ (`extra.unsignedTxBytes`) | `signMessage` ❌ `-32601`

> Measured — `hedera-unsigned-passthrough` (pre-built Transaction bytes) is signed. A structured request needs a node timestamp, so it returns `-32602`.

**Example chainId:** `hedera:mainnet/slip44:3030`

**signTransaction payload:**

```js
// Source: playground/presets.non-evm.json → hbar-transfer
{
  transaction: {
    type: 'CryptoTransfer',
    transfers: [
      { accountId: '0.0.800', amount: -1000000 },
      { accountId: '0.0.1000', amount: 1000000 }
    ],
    maxTransactionFee: 100000000,   // tinybars
    transactionValidDuration: 120
  }
}
```

---

### Near

**Support:** `signTransaction` ◐ path exists | `signMessage` ❌ `-32601`

> Measured — `-32601` never occurs. The current preset returns `-32602` because its `publicKey` differs from the device-derived key (the app must supply the real access key).

**Example chainId:** `near:mainnet/slip44:397`

**signTransaction payload:**

```js
// Source: playground/presets.non-evm.json → near-transfer
{
  transaction: {
    type: 'transfer',
    sender: 'alice.near',
    recipient: 'bob.near',
    amount: '1000000000000000000000000',   // yoctoNEAR (1 NEAR = 10^24)
    blockHash: '11111111111111111111111111111111',
    publicKey: 'ed25519:...'
  }
}
```

---

### Polkadot

**Support:** `signTransaction` ✅ (decoded `method`+`args`, or an `extra.scaleHex` blob) | `signMessage` ✅ (parachain only)

**Example chainId:** `polkadot:91b171bb158e2d3848fa23a9f1c25182/slip44:354`

**Use one of the two forms — do not mix them.**

- **decoded** — `method` + `args`. The device decodes the call and shows it on screen.
- **blob** — `extra.scaleHex` (a SCALE-encoded call). This is blind-signing; do not send `method`/`args` alongside it.

Writing the same value in two places drifts — measured (2026-07-22): only the recipient inside the blob was changed while `args[0]` was left as is, so **the displayed field and the signed bytes pointed at different recipients**.

**Send every signing-payload field regardless of which form you use.** A blob carries **only the call**, so the values below live outside it. If any is missing the wallet re-derives it, and "what the app declared" diverges from "what was signed" (measured: preset `era` Immortal → signed as Mortal).

| Field | Meaning |
|---|---|
| `era` · `nonce` · `tip` | signed extensions (extrinsic extra) |
| `specVersion` · `transactionVersion` | runtime versions — **real values** read from the chain |
| `blockHash` · `genesisHash` | **real values** read from the chain (a mortal era uses the checkpoint block) |
| `fee` | for device display. The app computes and passes it |

**signTransaction payload:**

```js
// Source: playground/presets.rest.json → dot-transfer
{
  transaction: {
    method: 'balances.transferAllowDeath',
    args: [
      '14dyYY72MDtfxAAjFnqwCR3YihV5UrqzMjEAf1ABXJ4vzLZj',  // recipient
      '1000000000000'   // Planck (1 DOT = 10^10)
    ],
    era: '0x00',
    nonce: 0,
    tip: 0,
    fee: '0',
    specVersion: 0,
    transactionVersion: 0,
    blockHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
    genesisHash: '0x0000000000000000000000000000000000000000000000000000000000000000'
  }
}
```

> ⚠️ The `0` / all-zero values above for `specVersion` / `transactionVersion` / `blockHash` / `genesisHash` are **placeholders in the playground preset**. The playground harness substitutes chain-read values just before signing. **A real app must put the values it read from the chain here** — sending the placeholders gets the transaction rejected by the node. The presets do not hardcode real values because they would go stale and you would end up signing with them.

---

### Solana

**Support:** `signTransaction` ✅ | `signMessage` ✅

**Example chainId:** `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501`

**signTransaction payload — recommended: base58 serialized (most reliable)**

```js
// Source: playground/presets.non-evm.json → sol-transfer-base58-serialized
// Serialize with @solana/web3.js:
// bs58.encode(tx.serialize({ requireAllSignatures: false, verifySignatures: false }))
{
  transaction: {
    serialized: '<base58-encoded-transaction>'
  }
}
```

**signTransaction payload — alternative: JSON instruction**

```js
// the data field accepts four forms: 0x hex (recommended) / base58 string / number array / object (SystemProgram only)
{
  transaction: {
    version: 0,  // or 'legacy'
    feePayer: '11111111111111111111111111111111',
    instructions: [{
      programId: '11111111111111111111111111111111',
      keys: [
        { pubkey: '...', isSigner: true, isWritable: true },
        { pubkey: '...', isSigner: false, isWritable: true }
      ],
      data: '0x020000000010270000000000'  // 0x hex recommended
    }],
    recentBlockhash: '...'
  }
}
```

**signTransaction payload — SPL token: form-D descriptor (the only form where the device shows symbol/amount)**

```js
// Source: playground/presets.non-evm.json → sol-spl-descriptor-transfer
// Send a token descriptor instead of instructions. The bridge assembles the instruction and derives the recipient ATA.
// The bridge signs with no network access, so the app must fill in these three (missing any of them returns -32602):
//   recentBlockhash    — base58, 32 bytes, no surrounding whitespace
//   preparedFee.fee    — positive integer lamports (the fee the device displays)
//   extra.isAssociated — whether the recipient ATA exists. If false, the bridge prepends an ATA-creation instruction
// Do not send the recipient ATA — the bridge derives it offline from owner+mint (so the app cannot change the displayed destination).
{
  transaction: {
    sender: '<owner pubkey>',
    recentBlockhash: '<blockhash>',
    preparedFee: { fee: 5000 },
    extra: { isAssociated: true },
    token: {
      contract: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',  // mint
      to: '<recipient owner wallet address — not the ATA>',
      amount: '1000',      // base units (before applying decimals)
      decimals: 6,
      symbol: 'USDC'
    }
  }
}
```

**signMessage payload:**

```js
{ message: '<base58-encoded-raw-bytes>' }
```

---

### Stacks

**Support:** `signTransaction` ✅ | `signMessage` ❌ `-32601`

**Example chainId:** `stacks:1/slip44:5757`

**signTransaction payload:**

```js
// Source: playground/presets.rest.json → stx-transfer
{
  transaction: {
    txType: 'tokenTransfer',
    recipient: 'SP3FBR2AGT5FGNUYBWABXE5BSTEV7GCME7NQME0EA',
    amount: '1000000',   // microSTX (1 STX = 1,000,000)
    memo: '',
    network: 'mainnet',
    fee: '200'
  }
}
```

---

### Stellar

**Support:** `signTransaction` ✅ (structured op / issued-asset descriptor / `{xdr}` envelope) | `signMessage` ✅ | `signAuthEntry` ✅ (Soroban auth entry)

**Example chainId:** `stellar:pubnet/slip44:148`

**Use one of the three forms — do not mix them.**

| Form | Used for | Identifying field |
|---|---|---|
| **structured op** | native XLM `payment`, Soroban `invokeHostFunction` (also needs `sorobanData`) | `type` (string) |
| **form-D (issued asset)** | trustline token transfers (USDC etc.) | `token` (object) — do not set `type` |
| **`{xdr}` envelope** | blind-sign a fully built XDR as is | `xdr` (string) |

With form-D the **app does not set `type`** — the wallet composes the descriptor into a `{type:'payment', asset:{code,issuer}, destination, amount}` envelope. Adding `type` yourself expresses the same value twice.

**The app supplies every value that makes up the signing payload** — both structured and form-D need `fee` · `sequenceNumber` · `timeBounds`, and Soroban `invokeHostFunction` additionally needs `sorobanData` (base64 `SorobanTransactionData` obtained from `simulateTransaction`). `{xdr}` encodes those inside the XDR, so only `fee` is kept (it is blind-signing, and that fee is the only display information the device receives).

**signTransaction payload — structured op (native XLM):**

```js
// Source: playground/presets.non-evm.json → xlm-payment
{
  transaction: {
    type: 'payment',
    destination: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    asset: { code: 'XLM', issuer: null },   // native
    amount: '10',
    memo: { type: 'none' },
    fee: 100,
    sequenceNumber: '0',                    // placeholder — see the caution below
    timeBounds: { minTime: '0', maxTime: '0' }
  }
}
```

**signTransaction payload — form-D (issued asset, e.g. USDC):**

```js
// Source: playground/presets.non-evm.json → xlm-usdc-payment
{
  transaction: {
    token: {
      contract: 'USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',  // `code-issuer`
      to: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC6PV',
      amount: '10000000',   // token base units (USDC has 7 decimals → 1 USDC)
      decimals: 7,
      symbol: 'USDC'
    },
    fee: 100,
    sequenceNumber: '0',
    timeBounds: { minTime: '0', maxTime: '0' }
  }
}
```

> ⚠️ The `sequenceNumber: '0'` above and the `'0'` values in `timeBounds` are **placeholders in the playground preset** (the state is fresh, so hardcoding real values would sign with stale ones). The playground harness substitutes them just before signing — **a real app must supply the account's current sequence and the timeBounds it intends.**
>
> An issued-asset transfer requires the **recipient to already hold a trustline** for that token (otherwise `op_no_trust`).

---

### Tezos

**Support:** `signTransaction` ◐ path exists | `signMessage` ❌ `-32601`

**Example chainId:** `tezos:NetXdQprcVkpaWU/slip44:1729`

**signTransaction payload:**

```js
// Source: playground/presets.rest.json → xtz-transfer
{
  transaction: {
    kind: 'transaction',
    source: 'tz1burnburnburnburnburnburnburjAYjjX',
    destination: 'tz1burnburnburnburnburnburnburjAYjjX',
    amount: '1000000',    // mutez (1 XTZ = 1,000,000)
    fee: '1420',
    counter: '1',
    gasLimit: '10600',
    storageLimit: '300'
  }
}
```

---

### Tron

**Support:** `signTransaction` ✅ (TRX / TRC20 / approve) | `signMessage` ❌ `-32601`

> Measured — TRC20 `TriggerSmartContract` is signed as well. The descriptor form returns `-32602` unless the `ref_block_*` fields are filled in.

**Example chainId:** `tron:0x2b6653dc/slip44:195`

**signTransaction payload — TRX transfer (supported):**

```js
{
  transaction: {
    raw_data: {
      contract: [{
        type: 'TransferContract',
        parameter: {
          value: {
            amount: 1000000,    // sun (1 TRX = 1,000,000)
            owner_address: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
            to_address: 'TVjsyZ7fYF3qLF6BQgPmTEZy1xrNNyVAAA'
          }
        }
      }]
    }
  }
}
```

**signTransaction payload — TRC20 TriggerSmartContract:**

```js
{
  transaction: {
    raw_data: {
      contract: [{
        type: 'TriggerSmartContract',
        parameter: {
          value: {
            owner_address: 'T...',
            contract_address: 'T...',  // TRC20 contract
            data: '0xa9059cbb...'      // transfer(address,uint256)
          }
        }
      }]
    }
  }
}
```

---

### VeChain

**Support:** `signTransaction` ✅ | `signMessage` ❌ `-32601`

**Example chainId:** `vechain:b1ac3413d346d43539627e6be7ec1b4a/slip44:818`

**signTransaction payload:**

```js
// Source: playground/presets.rest.json → vet-transfer (thor-devkit clauses)
{
  transaction: {
    chainTag: 74,
    blockRef: '0x00000000aabbccdd',
    expiration: 32,
    clauses: [{
      to: '0x0000000000000000000000000000000000000000',
      value: '0xde0b6b3a7640000',   // wei hex (1 VET = 10^18)
      data: '0x'
    }],
    gas: 21000,
    gasPriceCoef: 0,
    nonce: '0x1234'
  }
}
```

---

### Xahau

**Support:** `signTransaction` ◐ path exists | `signMessage` ❌ `-32601`

> Measured — `-32601` never occurs. Signing proceeds once `tx_json` carries `Sequence` / `LastLedgerSequence` / `Fee` (without them: `-32602`).

**Example chainId:** `xahau:mainnet/slip44:144`, `xahau:testnet/slip44:21337`

**signTransaction payload (same structure as XRP):**

```js
// Source: playground/presets.non-evm.json → xahau-payment
{
  transaction: {
    TransactionType: 'Payment',
    Account: 'rrrrrrrrrrrrrrrrrrrputRj8Lyv',
    Destination: 'rrrrrrrrrrrrrhbyxFUyg4pJeFLCBn',
    Amount: '1000000',   // drops (1 XAH = 1,000,000)
    Fee: '12',
    Sequence: 1,
    Flags: 0
  }
}
```

---

### XRP

**Support:** `signTransaction` ◐ path exists (Payment / AccountSet / TrustSet) | `signMessage` ❌ `-32601`

> Measured (2026-07-21) — `Payment` / `AccountSet` / `TrustSet` are none of them `-32601`. Supplying a complete `tx_json` (`Fee` · `Sequence` · `LastLedgerSequence`) enters the signing path.

**Example chainId:** `xrpl:0/slip44:144`

**signTransaction payload — Payment (supported):**

```js
// Source: playground/presets.non-evm.json → xrp-payment
{
  transaction: {
    TransactionType: 'Payment',
    Account: 'rrrrrrrrrrrrrrrrrrrputRj8Lyv',
    Destination: 'rrrrrrrrrrrrrhbyxFUyg4pJeFLCBn',
    Amount: '1000000',   // drops (1 XRP = 1,000,000)
    Fee: '12',
    Sequence: 1,
    Flags: 0
  }
}
```

---

## Common error codes

| Code | Meaning |
|------|------|
| `-32601` | Method not found — the family is unsupported by the bridge, or the method is unsupported |
| `-32602` | Invalid params — malformed payload (missing keyPath, type mismatch, …) |
| `-32603` | Internal error — device communication error or an unexpected failure |

## Related documents

- [playground/chains.json](../playground/chains.json) — family → chainId map (source of truth)
- [playground/presets.evm.json](../playground/presets.evm.json) — EVM payload examples
- [playground/presets.non-evm.json](../playground/presets.non-evm.json) — non-EVM payload examples
- [playground/presets.rest.json](../playground/presets.rest.json) — additional payload examples
- [playground/presets.bitcoin-tx.json](../playground/presets.bitcoin-tx.json) — Bitcoin UTXO examples
- [MIGRATION-v1-to-v2.md](../MIGRATION-v1-to-v2.md) — v1 → v2 migration guide
