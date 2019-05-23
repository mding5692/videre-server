# videre-server

## About

videre-server is a signalling server application created in sockjs-node and designed to work
with the videre-client library. It supports namespaces, disconnect handling and TLS.

## Installation

Clone the git repo to the server on which you wish to deploy the signaller.
You can then run the signaller.js file using:

```shell
nodejs signaller.js
```

or

```shell
node signaller.js
```

## Config Options

The conf.json file included in the bin directory allows you to specify the
desired port, turn on/off TLS support, and specify your TLS certificate files.

**Example configuration with TLS support:**

```
{
  "Port": 1111,
  "TLS": true,
  "Cert": "path_to_cert_file",
  "Key": "path_to_key_file"
}
```

## Logging

Detailed logs are saved to the log directory under the debug.log file. Note that videre-server does not provide it's own log file rotation, so you will need to manage the log files yourself, or remove the log file stream from server code.

## Advanced Client Integration

If you wish to utilize the signaller without the videre-client library,
you will have to manually communicate to the signaller either using a SockJS or Websocket library.

### Packet Format

All packets have a standard JSON format in order to simplify parsing. They are comprised of a "Header" and "Payload" portion.

The **header** portion of the packet remains consistent and requires the following parameters:

- **Event (string)** The command you wish the signaller to complete, options are 'connect', 'broadcast', 'ping' and 'disconnect'
- **UserId (string)** The user id that uniquely identifies a user
- **RoomId (string)** The room id that uniquely identifies which room you wish the user to connect to, use a complex hashed string for improved security

The **payload** portion of the packet is a JSON string that is used to provide additional data. The payload structure depends on the command being called.

**Example 'connect' packet:**

```json
{
  "Header": {
    "Event": "connect",
    "UserId": "some_user_id",
    "RoomId": "some_room_id",
  },
  "Payload": "{some json string}",
}
```


### Connect

Sending a connect packet will attempt to add a user to a room. Once connected, the signaller will broadcast back the packet with a boolean indicating if the user is the initiator added to the payload.

**Example sending a 'connect' packet:**

```json
{
  "Header": {
    "Event": "connect",
    "UserId": "peer1",
    "RoomId": "some_room_id",
  },
  "Payload": "{}",
}
```

**Example receiving a 'connect' packet, in this case 'peer1' has been identified as the initiator:**

```json
{
  "Header": {
    "Event": "connect",
    "UserId": "peer1",
    "RoomId": "some_room_id",
  },
  "Payload": "{true}",
}
```

### Disconnect

Sending a disconnect packet will remove the user from the room. You can also close the websocket connection, the signaller will automatically notify users of the disconnection.

**Example:**

```json
{
  "Header": {
    "Event": "disconnect",
    "UserId": "peer1",
    "RoomId": "some_room_id",
  },
  "Payload": "{}",
}
```

### Broadcast

Sending a broadcast packet will forward that packet to all other peers in the room. Use this to communicate ICE offers/answers and ICE candidates.

**Example:**

```json
{
  "Header": {
    "Event": "broadcast",
    "UserId": "peer1",
    "RoomId": "some_room_id",
  },
  "Payload": "{'candidate': 'some_ice_candidate'}",
}
```

### Ping

Sending a ping packet will request room data from the signaller. The signaller will send back the ping packet with an array of user id's currently in the room. Use of the pinging mechanism is not required since 'connect' packets should already provide enough user data to the initiator.

**Example sending a 'ping' packet:**

```json
{
  "Header": {
    "Event": "ping",
    "UserId": "peer1",
    "RoomId": "some_room_id",
  },
  "Payload": "{}",
}
```

**Example receiving a 'ping' packet:**

```json
{
  "Header": {
    "Event": "ping",
    "UserId": "peer1",
    "RoomId": "some_room_id",
  },
  "Payload": "{
    ['peer1', 'peer2']
  }",
}
```

### Sample WebRTC Communication

Establishing a peer-to-peer WebRTC video connection generally follows this pattern:

1. Peer1 sends a connect packet and waits until another peer connects, they will be marked as the initiator
2. Peer2 sends a connect packet and waits until another peer connects
3. Peer1 receives Peer2's connect packet and generates an ICE offer packet, the ICE offer is added to a broadcast payload and sent to Peer2
4. Peer2 receives Peer1's ICE offer and broadcasts back an ICE answer
5. Peer1 receives Peer2's ICE answer and both Peer1 and Peer2 begin generating ICE candidates
6. ICE candidates are sent to each other peer as they are generated until WebRTC has detected a stable connection, the streams are opened and both peers begin their video communication
7. Peer1 disconnects from the stream, the signaller notifies Peer2 of the disconnect who in turn also disconnects
