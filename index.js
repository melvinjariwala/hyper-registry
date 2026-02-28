const process = require('process')
const readline = require('readline')
const Corestore = require('corestore')
const HyperDHT = require('hyperdht')
const Hyperswarm = require('hyperswarm')
const b4a = require('b4a')
const RegistryServer = require('./lib/server')
const RegistryClient = require('./lib/client')

const BOOTSTRAP = [{ host: '127.0.0.1', port: 30001 }]

async function main() {
  const type = process.argv[2]

  if (type === 'server') {
    const store = new Corestore('./server-corestore')
    const dhtKeyPair = await store.createKeyPair('dht')
    const dht = new HyperDHT({ keyPair: dhtKeyPair, bootstrap: BOOTSTRAP })
    const swarm = new Hyperswarm({ dht })

    const server = new RegistryServer(store, swarm, dht)
    await server.ready()

    console.log('Registry Server running.')
    console.log('Server Public Key:', b4a.toString(server.getServerKey(), 'hex'))
    console.log('Database Core Key:', b4a.toString(server.getDiscoveryKey(), 'hex'))

    process.on('SIGINT', async () => {
      await swarm.destroy()
      await dht.destroy()
      process.exit()
    })
    return
  }

  if (type === 'client') {
    const serverPubKeyHex = process.argv[3]
    const coreKeyHex = process.argv[4]

    if (!serverPubKeyHex || !coreKeyHex) {
      console.error('Usage: node index.js client <serverPubKey> <coreKey>')
      process.exit(1)
    }

    const store = new Corestore('./client-corestore')
    const dhtKeyPair = await store.createKeyPair('dht-client')
    const dht = new HyperDHT({ keyPair: dhtKeyPair, bootstrap: BOOTSTRAP })
    const swarm = new Hyperswarm({ dht })

    const serverPubKey = b4a.from(serverPubKeyHex, 'hex')
    const coreKey = b4a.from(coreKeyHex, 'hex')

    const client = new RegistryClient(store, swarm, dht, serverPubKey, coreKey)
    await client.ready()

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

    rl.on('line', async (line) => {
      const [cmd, arg] = line.trim().split(' ')
      if (!cmd) return rl.prompt()

      try {
        if (cmd === 'register') {
          if (!arg) throw new Error('Username required')
          const status = await client.register(arg)

          if (status === 'IDEMPOTENT') {
            console.log(`Already registered by you: ${arg}`)
          } else {
            console.log(`Registered: ${arg}`)
          }
        } else if (cmd === 'lookup') {
          if (!arg) throw new Error('Username required')
          const pubKey = await client.lookup(arg)
          console.log(pubKey ? `${arg} -> ${b4a.toString(pubKey, 'hex')}` : 'Not found')
        } else if (cmd === 'list') {
          const users = await client.list()
          users.forEach((u) => console.log(`${u.username}: ${u.publicKey}`))
        } else if (cmd === 'delete') {
          if (!arg) throw new Error('Username required')
          await client.delete(arg)
          console.log(`Deleted: ${arg}`)
        } else if (cmd === 'exit') {
          await client.destroy()
          await swarm.destroy()
          await dht.destroy()
          process.exit(0)
        } else {
          console.error(
            'Unknown command. Use: register <name>, lookup <name>, list, delete <name>, exit'
          )
        }
      } catch (err) {
        console.error('Error:', err.message)
      }
      rl.prompt()
    })

    rl.setPrompt('registry> ')
    rl.prompt()
    return
  }

  console.error('Usage: node index.js <server|client>')
  process.exit(1)
}

main().catch(console.error)
