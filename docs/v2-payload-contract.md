# dcent-web-connector v2 — Per-Family Payload Contract

이 문서는 v2 통합 sign API에서 각 chain family별로 `payload` 필드에 어떤 shape를 전달해야 하는지를 명시한다.

```js
const result = await dcent.sign({
  method: 'signTransaction',  // 또는 'signMessage' / 'signTypedData' / ...
  chainId: 'eip155:1/slip44:60',
  payload: {
    keyPath: "m/44'/60'/0'/0/0",   // ⚠️ keyPath는 payload 안에 위치 (필수)
    transaction: { /* family-specific shape */ }
  }
})
```

**진실 출처(source of truth):** `playground/chains.json` (family → chainId 매핑) + `playground/presets.*.json` (payload shape 예시).

> **지원 상태** 는 현재 wm(`@iotrustgithub/dcent-wallet-models`) family 등록 상태를 반영한다.
> ⚠️ _미지원_ 으로 표기된 family/method는 wm에서 `-32601 Method not found`를 반환한다.

---

## 지원 상태 요약

| Family | signTransaction | signMessage | 비고 |
|--------|----------------|-------------|------|
| algorand | ✅ | ❌ -32601 | |
| bitcoin | ✅ (`dcent.sign` — inputs/outputs) | ❌ N/A | txType `p2pkh`/`p2wpkh` |
| cardano | ✅ (full-CBOR) | ⚠️ -32601 | signMessage: m02-05-30 전 |
| conflux | ✅ (EVM 호환) | ✅ | EVM family |
| constellation | ⚠️ -32601 | ❌ -32601 | wm ConstellationAPIImpl 미등록 |
| cosmos | ✅ | ❌ -32601 | |
| ethereum | ✅ | ✅ | EVM family |
| fil | ✅ | ❌ -32601 | |
| havah | ✅ (EVM 호환) | ✅ | EVM family |
| hedera | ⚠️ -32601 | ❌ -32601 | wm HederaAPIImpl 미등록 |
| near | ⚠️ -32601 | ❌ -32601 | wm NearAPIImpl 미등록 |
| polkadot | ✅ | ❌ -32601 | |
| solana | ✅ | ✅ | |
| stacks | ✅ | ❌ -32601 | |
| stellar | ⚠️ -32601 | ⚠️ -32601 | wm StellarAPIImpl 미등록 |
| tezos | ✅ | ❌ -32601 | |
| tron | ✅ (TRX transfer) / ⚠️ TRC20 -32601 | ❌ -32601 | TRC20: m02-05-25 전 |
| vechain | ✅ | ❌ -32601 | |
| xahau | ⚠️ -32601 | ❌ -32601 | wm XahauAPIImpl 미등록 |
| xrp | ✅ (Payment) / ❌ 비-Payment -32601 | ❌ -32601 | Payment만 지원 |

---

## Family별 Payload Contract

### Algorand

**지원:** `signTransaction` ✅ | `signMessage` ❌

**chainId 예시:** `algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k/slip44:283`

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

**지원:** `signTransaction` ✅ | `signMessage` ❌ N/A

Bitcoin은 `dcent.sign({ method: 'signTransaction', chainId, payload })`로 서명한다. `payload.transaction`은 UTXO `inputs[]` + `outputs[]` 구조이며, 각 input의 `txType`(`p2pkh`=legacy / `p2wpkh`=native segwit)이 서명 방식을 결정한다 (keyPath는 legacy·segwit 공통으로 항상 `m/44'`). 상태 기반 builder(`getBitcoinTransactionObject` + `addBitcoinTransactionInput`/`addBitcoinTransactionOutput`)도 대안으로 제공된다.

```js
{
  transaction: {
    inputs: [{ rawTransaction: '<prev tx hex>', index: 0, txType: 'p2pkh', keyPath: "m/44'/0'/0'/0/0" }],
    outputs: [{ txType: 'p2pkh', amount: 990000, addresses: ['<recipient>'] }]
  }
}
```

**chainId 예시:** `bip122:000000000019d6689c085ae165831e93/slip44:0` (BTC mainnet)

**Source:** `playground/presets.bitcoin-tx.json`

---

### Cardano

**지원:** `signTransaction` ✅ (full-CBOR 지원, m02-05-35/36/37 MERGED_TO_EPIC) | `signMessage` ⚠️ -32601 (m02-05-30 전)

**chainId 예시:** `cip34:1-764824073` (mainnet), `cip34:0-2` (testnet)

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
// Full CBOR hex — 어떤 트랜잭션 타입도 처리 가능
{
  transaction: {
    txCbor: '0x84a500...'   // CBOR-serialized transaction hex
  }
}
```

---

### Conflux

**지원:** `signTransaction` ✅ | `signMessage` ✅

**chainId 예시:** `conflux:cfx/slip44:503`

**signTransaction payload:**

```js
// Source: playground/presets.rest.json → cfx-transfer
// ⚠️ Conflux Core Space는 CIP-37 base32 주소(cfx:...) 필수 — hex(0x) 주소는 디바이스 오류
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
    epochHeight: 100000,       // 필수
    storageLimit: 0            // 필수
  }
}
```

---

### Constellation

**지원:** `signTransaction` ⚠️ -32601 | `signMessage` ❌ -32601

> wm ConstellationAPIImpl이 WalletConnect를 통해 아직 등록되지 않아 `-32601 Method not found` 반환.

**chainId 예시:** `constellation:mainnet/slip44:1137`

**signTransaction payload (등록 후 예상 shape):**

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

**지원:** `signTransaction` ✅ | `signMessage` ❌ -32601

**chainId 예시:** `cosmos:cosmoshub-4/slip44:118`, `cosmos:coreum-mainnet-1/slip44:990`

**signTransaction payload (Amino SignDoc — 단일 bank `MsgSend`만 지원):**

```js
// Source: playground/presets.rest.json → atom-transfer
// ⚠️ Amino 형식(snake_case) 필수. 단일 MsgSend만 서명 가능 —
//    CW20/IBC MsgTransfer·다중 메시지·기타 typeUrl은 -32601.
//    (Protobuf SIGN_MODE_DIRECT 형식은 bodyBytes 필드로 별도 지원)
{
  transaction: {
    msgs: [{
      type: 'cosmos-sdk/MsgSend',
      value: {
        from_address: 'cosmos1...',
        to_address: 'cosmos1...',
        amount: [{ denom: 'uatom', amount: '1000000' }]
      }
    }],
    fee: { amount: [{ denom: 'uatom', amount: '500' }], gas: '200000' },
    memo: '',
    chain_id: 'cosmoshub-4',
    account_number: '1',
    sequence: '1'
  }
}
```

---

### Ethereum

**지원:** `signTransaction` ✅ | `signMessage` ✅

**chainId 예시:** `eip155:1/slip44:60` (mainnet), `eip155:8217/slip44:60` (Kaia)

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

// method: 'signTypedData'  (EIP-712) — payload.data는 JSON.stringify된 문자열, version 동반
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

**지원:** `signTransaction` ✅ | `signMessage` ❌ -32601

**chainId 예시:** `fil:f/slip44:461`

**signTransaction payload (Lotus Message):**

```js
// Source: playground/presets.rest.json → fil-transfer
{
  transaction: {
    to: 'f1xcbgdhkgkwht3hrrnui3jdopeejsoas2rujnkdi',
    from: 'f1xcbgdhkgkwht3hrrnui3jdopeejsoas2rujnkdi',
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

**지원:** `signTransaction` ✅ (EVM 호환) | `signMessage` ✅

**chainId 예시:** `havah:mainnet/slip44:858` (mainnet), `havah:testnet/slip44:858` (testnet)

**signTransaction payload:** EVM shape와 동일 (Ethereum 섹션 참조)

---

### Hedera

**지원:** `signTransaction` ⚠️ -32601 | `signMessage` ❌ -32601

> wm HederaAPIImpl이 WalletConnect를 통해 아직 등록되지 않아 `-32601 Method not found` 반환.

**chainId 예시:** `hedera:mainnet/slip44:3030`

**signTransaction payload (등록 후 예상 shape):**

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

**지원:** `signTransaction` ⚠️ -32601 | `signMessage` ❌ -32601

> wm NearAPIImpl이 WalletConnect를 통해 아직 등록되지 않아 `-32601 Method not found` 반환.

**chainId 예시:** `near:mainnet/slip44:397`

**signTransaction payload (등록 후 예상 shape):**

```js
// Source: playground/presets.non-evm.json → near-transfer
{
  transaction: {
    type: 'transfer',
    sender: 'alice.near',
    recipient: 'bob.near',
    amount: '1000000000000000000000000',   // yoctoNEAR (1 NEAR = 10^24)
    nonce: 1,
    blockHash: '11111111111111111111111111111111',
    publicKey: 'ed25519:...'
  }
}
```

---

### Polkadot

**지원:** `signTransaction` ✅ | `signMessage` ❌ -32601

**chainId 예시:** `polkadot:91b171bb158e2d3848fa23a9f1c25182/slip44:354`

**signTransaction payload:**

```js
// Source: playground/presets.rest.json → dot-transfer
{
  transaction: {
    method: 'balances.transfer',
    args: [
      '1EzRDbELEVqAWLKkTTfNP2Mq6ZpKbFAhNfAJtUHBJjGBN1',  // recipient
      '1000000000'   // Planck (1 DOT = 10^10)
    ],
    era: '0x00',
    nonce: 1,
    tip: 0,
    specVersion: 1000000,
    transactionVersion: 26,
    blockHash: '0x...',
    genesisHash: '0x91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3'
  }
}
```

---

### Solana

**지원:** `signTransaction` ✅ | `signMessage` ✅

**chainId 예시:** `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501`

**signTransaction payload — 권장: base58 serialized (가장 안정적)**

```js
// Source: playground/presets.non-evm.json → sol-transfer-base58-serialized
// @solana/web3.js로 직렬화:
// bs58.encode(tx.serialize({ requireAllSignatures: false, verifySignatures: false }))
{
  transaction: {
    serialized: '<base58-encoded-transaction>'
  }
}
```

**signTransaction payload — 대안: JSON instruction**

```js
// data field는 네 가지 형식 지원: 0x hex(권장) / base58 string / number array / object(SystemProgram만)
{
  transaction: {
    version: 0,  // 또는 'legacy'
    feePayer: '11111111111111111111111111111111',
    instructions: [{
      programId: '11111111111111111111111111111111',
      keys: [
        { pubkey: '...', isSigner: true, isWritable: true },
        { pubkey: '...', isSigner: false, isWritable: true }
      ],
      data: '0x020000000010270000000000'  // 0x hex 권장
    }],
    recentBlockhash: '...'
  }
}
```

**signMessage payload:**

```js
{ message: '<base58-encoded-raw-bytes>' }
```

---

### Stacks

**지원:** `signTransaction` ✅ | `signMessage` ❌ -32601

**chainId 예시:** `stacks:1/slip44:5757`

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

**지원:** `signTransaction` ⚠️ -32601 | `signMessage` ⚠️ -32601

> wm StellarAPIImpl이 WalletConnect를 통해 아직 등록되지 않아 `signTransaction`이 `-32601` 반환.
> `signMessage`도 m02-05-30 전까지 `-32601` 반환.

**chainId 예시:** `stellar:pubnet/slip44:148`

**signTransaction payload (등록 후 예상 shape):**

```js
// Source: playground/presets.non-evm.json → xlm-payment
{
  transaction: {
    type: 'payment',
    destination: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
    amount: '10.0000000',    // XLM (7 decimal places)
    asset: { code: 'XLM', issuer: null },   // native
    memo: '',
    fee: '100',
    sequenceNumber: '1'
  }
}
```

---

### Tezos

**지원:** `signTransaction` ✅ | `signMessage` ❌ -32601

**chainId 예시:** `tezos:NetXdQprcVkpaWU/slip44:1729`

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

**지원:** `signTransaction` ✅ (TRX transfer) / ⚠️ TRC20 -32601 | `signMessage` ❌ -32601

> TRC20 `TriggerSmartContract`는 sister wm m02-05-25 전까지 `-32601 Method not found` 반환.

**chainId 예시:** `tron:0x2b6653dc/slip44:195`

**signTransaction payload — TRX transfer (지원):**

```js
{
  transaction: {
    raw_data: {
      contract: [{
        type: 'TransferContract',
        parameter: {
          value: {
            amount: 1000000,    // sun (1 TRX = 1,000,000)
            owner_address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
            to_address: 'TVjsyZ7fYF3qLF6BQgPmTEZy1xrNNyVAAA'
          }
        }
      }]
    }
  }
}
```

**signTransaction payload — TRC20 TriggerSmartContract (⚠️ -32601 until m02-05-25):**

```js
// m02-05-25-wm-tron-trigger-contract-wire 머지 후 지원 예정
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

**지원:** `signTransaction` ✅ | `signMessage` ❌ -32601

**chainId 예시:** `vechain:b1ac3413d346d43539627e6be7ec1b4a/slip44:818`

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

**지원:** `signTransaction` ⚠️ -32601 | `signMessage` ❌ -32601

> wm XahauAPIImpl이 WalletConnect를 통해 아직 등록되지 않아 `-32601 Method not found` 반환.

**chainId 예시:** `xahau:mainnet/slip44:144`, `xahau:testnet/slip44:21337`

**signTransaction payload (등록 후 예상 shape — XRP와 동일 구조):**

```js
// Source: playground/presets.non-evm.json → xahau-payment
{
  transaction: {
    TransactionType: 'Payment',
    Account: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
    Destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
    Amount: '1000000',   // drops (1 XAH = 1,000,000)
    Fee: '12',
    Sequence: 1,
    Flags: 0
  }
}
```

---

### XRP

**지원:** `signTransaction` ✅ (Payment) / ❌ 비-Payment -32601 | `signMessage` ❌ -32601

> `Payment` TransactionType만 지원. Offer, TrustSet 등 비-Payment 타입은 `-32601` 반환.

**chainId 예시:** `xrpl:0/slip44:144`

**signTransaction payload — Payment (지원):**

```js
// Source: playground/presets.non-evm.json → xrp-payment
{
  transaction: {
    TransactionType: 'Payment',
    Account: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
    Destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
    Amount: '1000000',   // drops (1 XRP = 1,000,000)
    Fee: '12',
    Sequence: 1,
    Flags: 0
  }
}
```

---

## 공통 에러 코드

| 코드 | 의미 |
|------|------|
| `-32601` | Method not found — family가 wm에 미등록이거나 method가 미지원 |
| `-32602` | Invalid params — 잘못된 payload (keyPath 누락, 타입 불일치 등) |
| `-32603` | Internal error — 디바이스 통신 오류 또는 예기치 않은 실패 |

## 관련 문서

- [playground/chains.json](../playground/chains.json) — family → chainId 매핑 (진실 출처)
- [playground/presets.evm.json](../playground/presets.evm.json) — EVM payload 예시
- [playground/presets.non-evm.json](../playground/presets.non-evm.json) — non-EVM payload 예시
- [playground/presets.rest.json](../playground/presets.rest.json) — 추가 payload 예시
- [playground/presets.bitcoin-tx.json](../playground/presets.bitcoin-tx.json) — Bitcoin UTXO 예시
- [MIGRATION-v1-to-v2.md](../MIGRATION-v1-to-v2.md) — v1 → v2 마이그레이션 가이드
