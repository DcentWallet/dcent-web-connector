# dcent-web-connector v2 — Per-Family Payload Contract

> 🇬🇧 English (canonical): [v2-payload-contract.md](v2-payload-contract.md)
> 이 문서는 한국어 사본이다. 내용이 갈리면 **영문이 정본**이다.

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
| stellar | ✅ (`{xdr}`) | ✅ | 지갑 허용 목록의 structured op 는 서명된다. Soroban `invokeHostFunction` 은 `sorobanData` 가 추가로 필요하며 아직 거부된다 |
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

Bitcoin은 `dcent.sign({ method: 'signTransaction', chainId, payload })`로 서명한다. `payload.transaction`은 UTXO `inputs[]` + `outputs[]` 구조이며, legacy 와 segwit 이 `chainId` 와 `m/44'` keyPath 를 **둘 다** 공유하므로 어느 계정이 서명하는지는 `payload.addressFormat`(`legacy` / `segwit-native` — `getAddress` 와 같은 enum)이 정한다(**가용성**: 이 필드는 wallet-models 의 `SignTransactionFromWireParams.addressFormat` 을 담은 bridge 배포본부터 읽힌다 — 그 이전 배포본은 필드를 무시하고 아래 `inputs[].txType` 추론으로 폴백한다). 생략하면 각 input 의 `txType`(`p2pkh`=legacy / `p2wpkh`=native segwit) 추론으로 폴백하는데, 그 신호는 PSBT payload 에는 없다. output 은 추가로 `txType: 'p2tr'`(Taproot 수신 주소)을 받는다 (input 은 불가 — Taproot UTXO 소비는 미지원). 상태 기반 builder(`getBitcoinTransactionObject` + `addBitcoinTransactionInput`/`addBitcoinTransactionOutput`)도 대안으로 제공된다.

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

**Horizen(ZEN) — 종료된 체인:** 네이티브 ZEN 체인은 **2025-07-23 Base ERC-20 마이그레이션으로 종료**되었다(구 mainchain과 EON EVM 체인 모두 discontinued). 기존 ZEN 잔고는 Base 상의 ERC-20 으로 이관되었고, 클레임은 지갑 message signing 기반 스냅샷이라 레거시 체인 트랜잭션을 요구하지 않는다.

따라서 `bip122:0007104ccda289427919efc39dc9e4d4/slip44:121` 로의 `signTransaction` 은 **더 이상 지원되지 않는다**. 종전에 이 문서가 안내하던 BIP-115 `option`(block hash + height) 규격은 그 체인 전용이었으므로 함께 제거했다.

> 체인 자체가 닫혀 있어 서명이 성공하더라도 broadcast 할 대상이 없다. Base 상의 ZEN 은 일반 ERC-20 이므로 **Ethereum family 경로(`eip155:8453`)** 를 사용한다.

**ZCASH도 `option`이 필수다** (2026-08-03 변경 — 이전에는 지갑이 자동으로 채웠다). ZCASH의 option은 consensus branch ID인데, 이 값은 네트워크 업그레이드 활성 높이마다 바뀐다. 서명기는 현재 블록 높이를 모르므로 **어떤 고정값을 써도 활성화 경계를 넘는 순간 틀린다** — 실제로 종전 자동 조립은 NU6.3 활성 이후 낡은 NU6.2 branch로 서명하고 있었다. 서명은 정상으로 보이고 broadcast에서만 거부되므로 원인이 드러나지 않는다.

`option`은 **prepare 단계에서 만드는 값**이다. 지갑 라이브러리의 `getZCASHOption(currency)`가 현재 높이를 조회해 만들어주므로, 그 결과를 그대로 넘기면 된다. 형식은 **정확히 16 hex**(`GroupId8 + branchId8`)다. 앞 8자는 해당 체인의 `GroupId`와 일치해야 하고 뒤 8자는 알려진 consensus branch ID여야 한다(둘 중 하나라도 어긋나면 `-32602`) — 디바이스가 앞 절반을 서명 대상과 최종 트랜잭션의 `nVersionGroupId`로, 뒤 절반을 sighash 개인화로 쓰기 때문이다.

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

**지원:** `signTransaction` ✅ (decoded `method`+`args`, 또는 `extra.scaleHex` blob) | `signMessage` ✅ (parachain만)

**chainId 예시:** `polkadot:91b171bb158e2d3848fa23a9f1c25182/slip44:354`

**두 형태 중 하나를 쓰고, 섞지 않는다.**

- **decoded** — `method` + `args`. 기기가 호출을 디코드해 화면에 보여준다.
- **blob** — `extra.scaleHex`(SCALE 인코딩된 call). blind-sign 이고, `method`/`args` 를 함께 두지 않는다.

같은 값을 두 곳에 적으면 drift 가 난다 — 실측(2026-07-22)에서 blob 의 수취인만 바꾸고 `args[0]` 을 그대로 둬, **표시용 필드와 서명 바이트가 서로 다른 수취인**을 가리켰다.

**서명 payload 필드는 어느 형태든 전부 보낸다.** blob 은 **call 만** 담으므로 아래 값들은 blob 밖에 있다. 하나라도 빠지면 지갑이 자체 재도출하게 되고, "앱이 선언한 것"과 "서명된 것"이 갈린다(실측: preset `era` Immortal → 서명은 Mortal).

| 필드 | 의미 |
|---|---|
| `era` · `nonce` · `tip` | 서명 확장(extrinsic extra) |
| `specVersion` · `transactionVersion` | 런타임 버전 — 체인에서 조회한 **실값** |
| `blockHash` · `genesisHash` | 체인에서 조회한 **실값**(mortal era 는 checkpoint 블록) |
| `fee` | 기기 표시용. 앱이 산정해 전달 |

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

> ⚠️ 위 `specVersion` / `transactionVersion` / `blockHash` / `genesisHash` 의 `0` · all-zero 는 **playground preset 의 placeholder** 다. playground 하네스가 서명 직전에 체인 조회값으로 치환한다. **실제 App 은 이 자리에 체인에서 조회한 실값을 넣어야 한다** — placeholder 를 그대로 보내면 노드가 거부한다. preset 에 실값을 박아두지 않는 이유는, 시간이 지나면 stale 값으로 서명하게 되기 때문이다.

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

**지원:** `signTransaction` ✅ (structured op / issued-asset descriptor / `{xdr}` envelope) | `signMessage` ✅ | `signAuthEntry` ✅ (Soroban auth entry)

**chainId 예시:** `stellar:pubnet/slip44:148`

**세 형태 중 하나를 쓰고, 섞지 않는다.**

| 형태 | 쓰는 곳 | 식별 필드 |
|---|---|---|
| **structured op** | native XLM `payment`, Soroban `invokeHostFunction` (`sorobanData` 추가 필요) | `type` (문자열) |
| **form-D (issued asset)** | trustline 토큰(USDC 등) 전송 | `token` (객체) — `type` 을 적지 않는다 |
| **`{xdr}` envelope** | 완성된 XDR 을 그대로 blind-sign | `xdr` (문자열) |

form-D 는 `type` 을 **앱이 적지 않는다** — 지갑이 descriptor 를 `{type:'payment', asset:{code,issuer}, destination, amount}` 봉투로 합성한다. 여기에 `type` 을 함께 적으면 같은 값을 두 곳에서 표현하게 된다.

**서명 payload 를 이루는 값은 앱이 전부 제공한다** — structured / form-D 모두 `fee` · `sequenceNumber` · `timeBounds` 가 필요하고, Soroban `invokeHostFunction` 은 `sorobanData`(`simulateTransaction` 으로 얻는 base64 `SorobanTransactionData`)가 추가로 필요하다. `{xdr}` 은 그 값들이 XDR 안에 인코딩돼 있으므로 `fee` 만 유지한다(blind-sign 이라 기기에 전달되는 유일한 표시 정보).

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
    sequenceNumber: '0',                    // placeholder — 아래 주의 참조
    timeBounds: { minTime: '0', maxTime: '0' }
  }
}
```

**signTransaction payload — form-D (issued asset, 예: USDC):**

```js
// Source: playground/presets.non-evm.json → xlm-usdc-payment
{
  transaction: {
    token: {
      contract: 'USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',  // `code-issuer`
      to: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC6PV',
      amount: '10000000',   // 토큰 최소단위 (USDC 7 decimals → 1 USDC)
      decimals: 7,
      symbol: 'USDC'
    },
    fee: 100,
    sequenceNumber: '0',
    timeBounds: { minTime: '0', maxTime: '0' }
  }
}
```

> ⚠️ 위 `sequenceNumber: '0'` 과 `timeBounds` 의 `'0'` 은 **playground preset 의 placeholder** 다(fresh state 라 실값을 박아두면 stale 로 서명된다). playground 하네스가 서명 직전에 치환한다 — **실제 App 은 계정의 현재 sequence 와 의도한 timeBounds 를 넣어야 한다.**
>
> issued asset 전송은 **수신처에 해당 토큰의 trustline 이 선행**돼야 한다(없으면 `op_no_trust`).

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

**지원:** `signTransaction` ◐ 경로 존재 (Payment / AccountSet / TrustSet) | `signMessage` ❌ `-32601`

> 실측(2026-07-21) — `Payment` / `AccountSet` / `TrustSet` 모두 `-32601` 이 아니다. 완성 `tx_json`(`Fee`·`Sequence`·`LastLedgerSequence`)을 넣으면 서명 경로로 진입한다.

**chainId 예시:** `xrpl:0/slip44:144`

**signTransaction payload — Payment (지원):**

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
