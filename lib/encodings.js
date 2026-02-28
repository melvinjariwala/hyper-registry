const c = require('compact-encoding')

module.exports = {
  bee: {
    keyEncoding: c.string,
    valueEncoding: c.fixed32
  },
  rpc: {
    registerRequest: c.string,
    deleteRequest: c.string
  }
}
