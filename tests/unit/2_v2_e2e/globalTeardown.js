/**
 * Jest globalTeardown — v2 e2e
 * harness server + sdk server를 close. 누수 방지.
 */
module.exports = async () => {
  const harnessServer = global.__HARNESS_SERVER__
  const sdkServer = global.__SDK_SERVER__
  if (harnessServer) await new Promise(resolve => harnessServer.close(resolve))
  if (sdkServer) await new Promise(resolve => sdkServer.close(resolve))
}
