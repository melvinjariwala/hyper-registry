const Hyperbee = require('hyperbee')
const RPC = require('@hyperswarm/rpc')
const b4a = require('b4a')
const { bee, rpc: rpcEncodings } = require('./encodings')

class RegistryClient {
  constructor(store, swarm, dht, serverPubKey, coreKey) {
    this.store = store
    this.swarm = swarm
    this.dht = dht
    this.serverPubKey = serverPubKey

    this.core = this.store.get({ key: coreKey })
    this.db = new Hyperbee(this.core, {
      keyEncoding: bee.keyEncoding,
      valueEncoding: bee.valueEncoding
    })

    this.rpc = new RPC({ dht: this.dht })
    this.rpcClient = this.rpc.connect(this.serverPubKey)
  }

  async ready() {
    await this.core.ready()
    this.swarm.join(this.core.discoveryKey)
    this.swarm.on('connection', (conn) => this.store.replicate(conn))
    await this.core.update()
  }

  async syncDatabase(expectWrite = false) {
    if (this.core.peers.length === 0) {
      await new Promise((resolve) => this.core.once('peer-add', resolve))
    }

    const prevLength = this.core.length
    await this.core.update()

    if (expectWrite && this.core.length <= prevLength) {
      await new Promise((resolve) => this.core.once('append', resolve))
    }

    if (this.core.length > 0) {
      await this.core.download({ start: 0, end: this.core.length }).downloaded()
    }
  }

  _parseResponse(res) {
    const str = b4a.toString(res)
    if (str.startsWith('ERR:')) throw new Error(str.slice(4))
    return str
  }

  async register(username) {
    const res = await this.rpcClient.request('register', username, {
      requestEncoding: rpcEncodings.registerRequest
    })

    const status = this._parseResponse(res)
    const expectWrite = status === 'OK'
    await this.syncDatabase(expectWrite)

    return status
  }

  async delete(username) {
    const res = await this.rpcClient.request('delete', username, {
      requestEncoding: rpcEncodings.deleteRequest
    })
    this._parseResponse(res)
    await this.syncDatabase(true)
    return true
  }

  async lookup(username) {
    await this.syncDatabase()
    const node = await this.db.get(username)
    if (!node) return null
    return node.value
  }

  async list() {
    const users = []
    await this.syncDatabase()
    for await (const { key, value } of this.db.createReadStream()) {
      users.push({ username: key, publicKey: b4a.toString(value, 'hex') })
    }
    return users
  }

  async destroy() {
    await this.rpc.destroy()
  }
}

module.exports = RegistryClient
