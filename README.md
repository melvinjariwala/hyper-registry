# hyper-registry

A peer-to-peer username registry powered by the Holepunch stack.

## Architecture

This system utilizes a Command Query Responsibility Segregation (CQRS) model over a P2P network:

- **Writes (Commands):** Executed via `@hyperswarm/rpc`. The registry server listens for `register` and `delete` commands and appends them to its local `Hyperbee` instance.
- **Reads (Queries):** Executed locally. The client passively replicates the server's database via `Hyperswarm`. Queries (`lookup`, `list`) are run against the local read-only replica, providing instant $O(\log N)$ lookups without network overhead.

### Authentication

The registry leverages the underlying Noise Protocol framework for authentication. Instead of sending public keys in the RPC payload, the server extracts the cryptographically verified `remotePublicKey` directly from the RPC stream context. This makes identity spoofing impossible at the transport layer.

### Synchronization

Because Hypercore replication is asynchronous, the client implements a robust `syncDatabase` method. After a successful write operation, the client explicitly pauses execution and waits for the underlying `Hypercore` to emit an `append` event, guaranteeing the local replica is strictly consistent before returning control to the user.

## Setup & Usage

### 1. Start the Local Testnet

The system assumes a local bootstrap node is running for peer discovery.

```bash
npm install -g hyperdht
hyperdht --bootstrap --host 127.0.0.1 --port 30001
```

### 2. Start the Server

```bash
npm install
node index.js server
```

Note the Server Public Key and Database Core Key output in the console.

### 3. Start the Client REPL

The client operates as a continuous interactive session. This ensures the DHT keypair remains persistent across commands and eliminates Swarm connection overhead for sequential queries.

```bash
node index.js client <SERVER_PUBLIC_KEY> <DATABASE_CORE_KEY>
```

Commands:

- `register <username>`
- `lookup <username>`
- `list`
- `delete <username>`
- `exit`

### 4. Testing

The test suite runs integration tests against dynamically generated, temporary OS-level Corestores using a local testnet.

```bash
npm run test
```

To manually clear local development databases, run `npm run clean`.

---

Note on tooling: I used AI as an interactive tutor while learning the Holepunch stack — to clarify internals, challenge my architectural assumptions, and understand P2P race conditions. The architecture, implementation, and code are my own.
