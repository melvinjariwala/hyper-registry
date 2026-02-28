const Hyperbee = require('hyperbee')
const RPC = require('@hyperswarm/rpc')
const b4a = require('b4a')
const { bee, rpc: rpcEncodings } = require('./encodings')

class RegistryServer {
  constructor(store, swarm, dht) {
    this.store = store
    this.swarm = swarm
    this.dht = dht

    this.core = this.store.get({ name: 'registry-db' })
    this.db = new Hyperbee(this.core, {
      keyEncoding: bee.keyEncoding,
      valueEncoding: bee.valueEncoding
    })

    this.rpc = new RPC({ dht: this.dht })
    this.rpcServer = this.rpc.createServer()
  }

  async ready() {
    await this.core.ready()
    this.swarm.join(this.core.discoveryKey)
    this.swarm.on('connection', (conn) => this.store.replicate(conn))

    this.rpcServer.respond(
      'register',
      { requestEncoding: rpcEncodings.registerRequest },
      this._onRegister.bind(this)
    )
    this.rpcServer.respond(
      'delete',
      { requestEncoding: rpcEncodings.deleteRequest },
      this._onDelete.bind(this)
    )

    await this.rpcServer.listen()
  }

  async _onRegister(req, rpc) {
    const username = req
    const callerPubKey = rpc.stream.remotePublicKey

    const existing = await this.db.get(username)
    if (existing) {
      if (b4a.equals(existing.value, callerPubKey)) return b4a.from('IDEMPOTENT')
      return b4a.from('ERR:Username already taken')
    }

    await this.db.put(username, callerPubKey)
    return b4a.from('OK')
  }

  async _onDelete(req, rpc) {
    const username = req
    const callerPubKey = rpc.stream.remotePublicKey

    const existing = await this.db.get(username)
    if (!existing) return b4a.from('ERR:Username not found')

    if (!b4a.equals(existing.value, callerPubKey)) {
      return b4a.from('ERR:Unauthorized: only the owner can delete this username')
    }

    await this.db.del(username)
    return b4a.from('OK')
  }

  getServerKey() {
    return this.rpcServer.publicKey
  }

  getDiscoveryKey() {
    return this.core.key
  }
}

module.exports = RegistryServer
