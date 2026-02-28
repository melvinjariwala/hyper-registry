const test = require('brittle')
const os = require('os')
const path = require('path')
const fs = require('fs')
const Corestore = require('corestore')
const HyperDHT = require('hyperdht')
const Hyperswarm = require('hyperswarm')
const createTestnet = require('hyperdht/testnet')
const RegistryServer = require('../lib/server')
const RegistryClient = require('../lib/client')

async function setup(t) {
  const testnet = await createTestnet(3, t.teardown)

  const createNode = async () => {
    const dir = path.join(os.tmpdir(), 'registry-test-' + Math.random().toString(16).slice(2))
    const store = new Corestore(dir)
    const dht = new HyperDHT({ bootstrap: testnet.bootstrap })
    const swarm = new Hyperswarm({ dht })

    t.teardown(async () => {
      await swarm.destroy()
      await dht.destroy()
      await store.close()
      fs.rmSync(dir, { recursive: true, force: true })
    })

    return { store, swarm, dht }
  }

  const serverNode = await createNode()
  const server = new RegistryServer(serverNode.store, serverNode.swarm, serverNode.dht)
  await server.ready()

  const clientNode = await createNode()
  const client = new RegistryClient(
    clientNode.store,
    clientNode.swarm,
    clientNode.dht,
    server.getServerKey(),
    server.getDiscoveryKey()
  )
  await client.ready()

  const evilNode = await createNode()
  const evilClient = new RegistryClient(
    evilNode.store,
    evilNode.swarm,
    evilNode.dht,
    server.getServerKey(),
    server.getDiscoveryKey()
  )
  await evilClient.ready()

  return { server, client, evilClient }
}

test('register and lookup username', async (t) => {
  const { client } = await setup(t)

  const success = await client.register('melvin')
  t.ok(success, 'registration successful')

  const pubKey = await client.lookup('melvin')
  t.ok(pubKey, 'lookup found the username')

  t.alike(pubKey, client.dht.defaultKeyPair.publicKey, 'public key matches client')
})

test('list all registered users', async (t) => {
  const { client } = await setup(t)

  await client.register('melvin')
  await client.register('p2p-hacker')

  const users = await client.list()
  t.is(users.length, 2, 'found both users')
  t.is(users[0].username, 'melvin')
  t.is(users[1].username, 'p2p-hacker')
})

test('idempotent registration succeeds', async (t) => {
  const { client } = await setup(t)

  await client.register('melvin')
  const status = await client.register('melvin')

  t.is(status, 'IDEMPOTENT', 'double registration returns IDEMPOTENT for the owner')
})

test('prevent registration hijacking', async (t) => {
  const { client, evilClient } = await setup(t)

  await client.register('melvin')

  try {
    await evilClient.register('melvin')
    t.fail('should have thrown an error')
  } catch (err) {
    t.is(err.message, 'Username already taken', 'prevented hijack')
  }
})

test('authorized delete removes username', async (t) => {
  const { client } = await setup(t)

  await client.register('melvin')
  const deleted = await client.delete('melvin')
  t.ok(deleted, 'deletion successful')

  const pubKey = await client.lookup('melvin')
  t.absent(pubKey, 'username no longer exists in database')
})

test('prevent unauthorized delete', async (t) => {
  const { client, evilClient } = await setup(t)

  await client.register('melvin')

  try {
    await evilClient.delete('melvin')
    t.fail('should have thrown an error')
  } catch (err) {
    t.is(
      err.message,
      'Unauthorized: only the owner can delete this username',
      'prevented malicious delete'
    )
  }
})
