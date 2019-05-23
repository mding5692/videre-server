
var http = require('http');
var https = require('https');
var sockjs = require('sockjs');
var fs = require('fs');
var bunyan = require('bunyan');
var log = bunyan.createLogger({
    name: 'videre',
    streams: [
        {
            level: 'info',
            stream: process.stdout,
        },
        {
            level: 'debug',
            path: 'log/debug.log',
        }
    ],
});

var options = {
	sockjs_url: "http://cdn.jsdelivr.net/sockjs/1.0.1/sockjs.min.js"
};

var server = sockjs.createServer(options);

var roomList = {};

server.on('connection', function(session) {
    session.on('data', function(packet) {
        
        log.debug('Message Received:')
        log.debug(packet);

        try {
    		var jsonPacket = JSON.parse(packet);
    	} catch (err) {
    		log.error('Error parsing JSON message: ' + err);
    		return;
    	}

        if (jsonPacket.Header.Event == 'connect') {
        	connectUser(jsonPacket, session);
        } else if (jsonPacket.Header.Event == 'broadcast') {
        	broadcast(jsonPacket);
        } else if (jsonPacket.Header.Event == 'ping') {
        	ping(jsonPacket, session);
        } else if (jsonPacket.Header.Event == 'disconnect') {
        	disconnectUser(jsonPacket, session);
        }
    });

    session.on('close', function() {
        disconnectUser(session);
    });
});

// Disconnect the user if they are connected to another room,
// add them to a room and broadcast the join to everyone in 
// the room
function connectUser(packet, session) {
    log.info('User ' + packet.Header.UserId + ' connected');

    var user = {
        userId: packet.Header.UserId,
        session: session,
        isInitiator: false,
    };
    
    // Disconnect the user from any existing rooms
    disconnectUser(session);

    // Add a user, and determine if they are the initiator
    var isInitiator = addUserToRoom(packet.Header.RoomId, user);
    
    // Construct the payload
    packet.Payload = JSON.stringify(isInitiator);
    
    // Notify the room a user has connected
    broadcast(packet);
}

// Check if the user is connected to the room, broadcast
// message to all users in that room
function broadcast(packet) {
    
    // Marshal the packet
    var packetString = JSON.stringify(packet);

    // Send a message to each user in the room
    for (var i = 0; i < roomList[packet.Header.RoomId].length; i++) {
        roomList[packet.Header.RoomId][i].session.write(packetString);
    }
}

// Report back a list of users that are currently in
// the event
function ping(packet, session) {
    
    var userIdList = [];

    // Generate a list of users
    for (var i = 0; i < roomList[packet.Header.RoomId].length; i++) {
        userIdList.push(roomList[packet.Header.RoomId][i].userId);
    }

    // Re-construct the packet
    packet.Payload = JSON.stringify(userIdList);
    var packetString = JSON.stringify(packet);

    // Ping back the packet with the rooms
    // user info
    session.write(packetString);
}

// Search through each room and remove the user
// from each room, notify all other users in the room
function disconnectUser(session) {
    log.info('User Left');
    
    var disconnectRoomList = [];
    var disconnectedUser;

    // Remove the user from every rooms they were
    // connected to
    for (var room in roomList) {
        sessionIndex = -1;
        for (var i = 0; i < roomList[room].length; i++) {
            if (roomList[room][i].session == session) {
                disconnectedUser = roomList[room][i];
                sessionIndex = i;
            }
        }
        if (sessionIndex != -1) {
            roomList[room].splice(sessionIndex, 1);
            disconnectRoomList.push(room)
        }
    }

    // For each room the user was connected,
    // broadcast a disconnect message
    for (var i = 0; i < disconnectRoomList.length; i++) {

        // Construct a disconnect packet
        disconnectPacket = {
        	Header: {
            	Event: 'disconnect',
            	UserId: disconnectedUser.userId,
            	RoomId: disconnectRoomList[i],
            },
            Payload: '',
        };

        broadcast(disconnectPacket);
    }

    // Cleanup
    refreshRooms();
}

// Add a user to a room, create a room if one
// does not exist
function addUserToRoom(roomId, user) {
    if (roomId in roomList) {
        // Room exists, add user to the room
        log.info('Added User: ' + user.userId + ' to Room: ' + roomId);
        
        roomList[roomId].push(user);
    } else {
        // Room doesn't exist, create the room
        log.info('Created Room: ' + roomId);
        
        user.isInitiator = true;
        roomList[roomId] = [user];
    }

    return user.isInitiator;
}

// Destroy any empty rooms
function refreshRooms() {
    
    // Locate empty rooms
    var keys = [];
    for (var room in roomList) {
        if (roomList[room].length == 0) {
            keys.push(room);
        }
    }

    // Delete empty rooms
    for (var i = 0; i < keys.length; i++) {
    	log.info('Room: ' + keys[i] + ' is empty, deleting...');
        delete roomList[keys[i]];
    }
}

var confData = JSON.parse(fs.readFileSync('conf.json'));

if (confData.TLS) {
	var webServerOptions = {
		cert: fs.readFileSync(confData.Cert),
		key: fs.readFileSync(confData.Key),
	};
	var webserver = https.createServer(webServerOptions);
} else {
	var webserver = http.createServer();
}

server.installHandlers(webserver, {prefix:'/echo'});
log.info('Starting Signaller...')
log.info('Listening on ' + String(confData.Port));
webserver.listen(confData.Port, '0.0.0.0');
