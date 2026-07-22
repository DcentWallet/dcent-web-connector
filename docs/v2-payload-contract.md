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

> **지원 상태는 실측값이다** (2026-07-21, swproxy 하네스 — signMessage 152 chain 전수 / signTransaction 86 preset · 367 case).
>
> - ✅ — 서명까지 도달 확인
> - ◐ — 경로는 존재하나 현재 예시 payload 로는 서명 미도달(아래 사유 참고). **미지원이 아니다**
> - ❌ `-32601` — 브리지가 그 method 를 지원하지 않는다는 **유일한 신뢰 신호**
>
> `-32602` 는 미지원이 아니라 **payload 가 덜 채워졌다**는 뜻이다. 브리지는 네트워크 접근 없이 서명하므로
> nonce · sequence · fee · blockhash 같은 consensus 필드를 앱이 완성해 보내야 한다(각 family 섹션 참고).

---

## 지원 상태 요약

| Family | signTransaction | signMessage | 실측 비고 |
|--------|----------------|-------------|------|
| algorand | ✅ | ❌ `-32601` | payment / ASA / ASA descriptor 서명 |
| bitcoin | ◐ | ❌ `-32601` | 하네스가 실계정 UTXO 를 못 만들어 미도달(prevout 불일치) |
| cardano | ✅ | ❌ `-32601` | full-CBOR 10 preset 서명 |
| conflux | ◐ | ❌ `-32601` | `storageLimit` / `epochHeight` 완성 필요 |
| constellation | ✅ | ❌ `-32601` | 지원 metagraph(DOR) 서명. 미지원 metagraph 는 `-32602` |
| cosmos | ✅ | ❌ `-32601` | Amino 7 preset 서명 |
| ethereum | ✅ | ✅ | signMessage 94 chain 중 91 서명. **XDC(`eip155:50/51`)만 `-32601`** |
| fil | ✅ | ❌ `-32601` | |
| havah | ✅ (EVM 호환) | ❌ `-32601` | EVM 호환이지만 signMessage 는 미지원 |
| hedera | ✅ | ❌ `-32601` | `extra.unsignedTxBytes` passthrough 서명. structured 는 `-32602` |
| klaytn (Kaia) | ✅ | ✅ | ethereum family 로 처리 |
| near | ◐ | ❌ `-32601` | 예시 `publicKey` 가 기기 파생 키와 달라 미도달 |
| polkadot | ✅ (`extra.scaleHex`) | ✅ parachain / ❌ relay `-32601` | relay chain(Polkadot)만 signMessage 미지원 |
| solana | ✅ | ✅ | form-D descriptor 서명 |
| stacks | ✅ | ❌ `-32601` | |
| stellar | ✅ (`{xdr}`) | ✅ | structured payment / Soroban 은 `-32602` |
| tezos | ◐ | ❌ `-32601` | pre-forged `extra.unsignedTxBytes` 필요 |
| tron | ✅ | ❌ `-32601` | TRX / TRC20 transfer / approve 서명 |
| vechain | ✅ | ❌ `-32601` | |
| xahau | ◐ | ❌ `-32601` | `tx_json` 의 `Sequence` / `LastLedgerSequence` 완성 필요 |
| xrp | ◐ | ❌ `-32601` | 동일 (Payment / AccountSet / TrustSet 모두 `-32601` 아님) |

---

## Family별 Payload Contract

### Algorand

**지원:** `signTransaction` ✅ | `signMessage` ❌ `-32601`

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

**지원:** `signTransaction` ◐ 경로 존재 | `signMessage` ❌ `-32601`

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

**지원:** `signTransaction` ✅ (full-CBOR) | `signMessage` ❌ `-32601`

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

**지원:** `signTransaction` ◐ 경로 존재 | `signMessage` ❌ `-32601`

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

**지원:** `signTransaction` ✅ | `signMessage` ❌ `-32601`

> 실측 — 지원되는 metagraph(예: DOR) 전송은 서명된다. 미지원 metagraph id 는 `-32602`(gateway endpoint 부재).

**chainId 예시:** `constellation:mainnet/slip44:1137`

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

**지원:** `signTransaction` ✅ | `signMessage` ❌ `-32601`

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

**지원:** `signTransaction` ✅ | `signMessage` ❌ `-32601`

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

**지원:** `signTransaction` ✅ (EVM 호환) | `signMessage` ❌ `-32601`

**chainId 예시:** `havah:mainnet/slip44:858` (mainnet), `havah:testnet/slip44:858` (testnet)

**signTransaction payload:** EVM shape와 동일 (Ethereum 섹션 참조)

---

### Hedera

**지원:** `signTransaction` ✅ (`extra.unsignedTxBytes`) | `signMessage` ❌ `-32601`

> 실측 — `hedera-unsigned-passthrough`(pre-built Transaction bytes)는 서명된다. structured 요청은 노드 타임스탬프가 필요해 `-32602`.

**chainId 예시:** `hedera:mainnet/slip44:3030`

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

**지원:** `signTransaction` ◐ 경로 존재 | `signMessage` ❌ `-32601`

> 실측 — `-32601` 은 발생하지 않는다. 현재 preset 은 `publicKey` 가 기기 파생 키와 달라 `-32602`(app 이 실제 access-key 를 넣어야 함).

**chainId 예시:** `near:mainnet/slip44:397`

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

**지원:** `signTransaction` ✅ (`extra.scaleHex`) | `signMessage` ✅ (parachain만)

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

**signTransaction payload — SPL 토큰: form-D descriptor (기기가 심볼/금액을 표시하는 유일한 형태)**

```js
// Source: playground/presets.non-evm.json → sol-spl-descriptor-transfer
// instructions 대신 token descriptor 를 보낸다. instruction 조립과 수신 ATA 파생은 브리지가 한다.
// 브리지는 네트워크 접근 없이 서명하므로 아래 3개를 앱이 완성해 보내야 한다 (빠지면 -32602):
//   recentBlockhash    — base58 32바이트, 앞뒤 공백 없이
//   preparedFee.fee    — 양의 정수 lamports (기기가 표시하는 수수료)
//   extra.isAssociated — 수신자 ATA 존재 여부. false 면 브리지가 ATA 생성 instruction 을 함께 넣는다
// 수신 ATA 는 보내지 않는다 — 브리지가 owner+mint 로 오프라인 파생한다(앱이 표시 목적지를 못 바꾼다).
{
  transaction: {
    sender: '<owner pubkey>',
    recentBlockhash: '<blockhash>',
    preparedFee: { fee: 5000 },
    extra: { isAssociated: true },
    token: {
      contract: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',  // mint
      to: '<수신자 owner 지갑 주소 — ATA 아님>',
      amount: '1000',      // base units (decimals 반영 전)
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

**지원:** `signTransaction` ✅ | `signMessage` ❌ `-32601`

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

**지원:** `signTransaction` ✅ (`{xdr}` envelope) | `signMessage` ✅

> 실측 — `stellar-xdr-passthrough-blind-sign`(완성 XDR)은 서명된다. structured payment / Soroban 은 계정 sequence·시뮬레이션이 필요해 `-32602`.

**chainId 예시:** `stellar:pubnet/slip44:148`

**signTransaction payload:**

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

**지원:** `signTransaction` ◐ 경로 존재 | `signMessage` ❌ `-32601`

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

**지원:** `signTransaction` ✅ (TRX / TRC20 / approve) | `signMessage` ❌ `-32601`

> 실측 — TRC20 `TriggerSmartContract` 도 서명된다. descriptor 형태는 `ref_block_*` 완성 필드가 없으면 `-32602`.

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

**지원:** `signTransaction` ✅ | `signMessage` ❌ `-32601`

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

**지원:** `signTransaction` ◐ 경로 존재 | `signMessage` ❌ `-32601`

> 실측 — `-32601` 은 발생하지 않는다. `tx_json` 에 `Sequence` / `LastLedgerSequence` / `Fee` 가 완성돼야 서명된다(없으면 `-32602`).

**chainId 예시:** `xahau:mainnet/slip44:144`, `xahau:testnet/slip44:21337`

**signTransaction payload (XRP와 동일 구조):**

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

**지원:** `signTransaction` ◐ 경로 존재 (Payment / AccountSet / TrustSet) | `signMessage` ❌ `-32601`

> 실측(2026-07-21) — `Payment` / `AccountSet` / `TrustSet` 모두 `-32601` 이 아니다. 완성 `tx_json`(`Fee`·`Sequence`·`LastLedgerSequence`)을 넣으면 서명 경로로 진입한다.

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
| `-32601` | Method not found — family 가 브리지에서 미지원이거나 method 가 미지원 |
| `-32602` | Invalid params — 잘못된 payload (keyPath 누락, 타입 불일치 등) |
| `-32603` | Internal error — 디바이스 통신 오류 또는 예기치 않은 실패 |

## 관련 문서

- [playground/chains.json](../playground/chains.json) — family → chainId 매핑 (진실 출처)
- [playground/presets.evm.json](../playground/presets.evm.json) — EVM payload 예시
- [playground/presets.non-evm.json](../playground/presets.non-evm.json) — non-EVM payload 예시
- [playground/presets.rest.json](../playground/presets.rest.json) — 추가 payload 예시
- [playground/presets.bitcoin-tx.json](../playground/presets.bitcoin-tx.json) — Bitcoin UTXO 예시
- [MIGRATION-v1-to-v2.md](../MIGRATION-v1-to-v2.md) — v1 → v2 마이그레이션 가이드
