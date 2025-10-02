/*
    SERVER SOURCE CODE: https://glitch.com/edit/#!/gvbvdxx-cloud-server

    NOTICE:
    THIS IS NOT FOR SCRATCH CLOUD VARIABLE SERVERS.
    WHEN I MENTION "CLOUD SERVER", I MEAN AS IN
    THE ONE FOR THIS EXTENSION.
    
    This extension was created by gvbvdxx.
    You are allowed to use it in your own scratch mods or whatever,
    but just give credit if you want to use this extension. If you are using in an
    project, you don't need credit, but it would be nice.
    Credit is not required at all for the server used,
    same as before, it would be nice.

    As mentioned in the scratch extension, its not recommended
    to use the default server. (wss://gvbvdxx-cloud-server.glitch.me/)
    I say this because there might be interference or slowdown from other people
    when using the default server, you can simply create your own by going to the
    server source code URL and clicking the remix button. I also
    recommend creating or using a glitch account before remixing,
    so your server does not get automatically deleted or something
    like that. The servers WSS url would be
    something like "wss://glitch-server-name.glitch.me/".
    glitch-server-name being your glitch project name.
    Make sure not to include quotation marks (") when using the WSS/WS URL.
*/

//Small documentary here (This may not be completley accurate anymore):
//Global variables - Shared variables kept by the server, these variables are saved even when you disconnect from it, but if the server restarts or goes offline, then the variables are lost. These variables can be read or changed by anyone.
//Global events - Events that can be fired and sent out to everyone, useful for calling out important events.
//Local variables - They can be read and set by anyone, but you store them. These can be used for display names, player cordinates, etc. When you disconnect from the server, they can still be read and set by others that have seen you on the server, but are no longer stored and managed by the server anymore (they would not sync to everyone else if you disconnect and another sets a value).
//Local events - events that can be fired by anyone to you or anyone else, useful for sending an event or private message between one user to another.


(function (Scratch) {

    var Cast = Scratch.Cast;
    var BlockType = Scratch.BlockType;
    var ArgumentType = Scratch.ArgumentType

    const vm = Scratch.vm;
    const runtime = vm.runtime;
    const renderer = runtime.renderer;
    const canvas = renderer.canvas;
    var extid = "gvbcloud";
    
    class GvbvdxxCloud {
        constructor () {
            this.websocket = null;
            this.targetWebsocketURI = "";
            this.connected = false;
            this.isReady = false;
            this.requestedToConnect = false;
            this.inConnectLoop = false;
            
            this.disconnectOnProjectStop = false;
            
            this.currentClientData = {};
            this.globalEventsReceived = {};
            this.localEventsReceived = {};
            this._lastLocalVars = {};
            this._lastGlobalVars = {};
            
            var t = this;

            runtime.on('AFTER_EXECUTE', function () {
                for (var name of Object.keys(t.globalEventsReceived)) {
                    t.globalEventsReceived[name] = false;
                }
                for (var name of Object.keys(t.localEventsReceived)) {
                    t.localEventsReceived[name] = false;
                }
            });
            runtime.on('PROJECT_STOP_ALL', function () {
                 if (t.disconnectOnProjectStop) {
                    t._closeConnectLoop();
                 }
            });
            
            t._resetClientData = function () {
                t.currentClientData = {
                    variables: {},
                    globalVariables: {},
                    connectedUsers: [],
                    id: null,
                    globalEventSentFrom: "",
                    globalEventValue: "",
                    localEventSentFrom: "",
                    localEventValue: ""
                };
                t._lastLocalVars = {};
                t._lastGlobalVars = {};
            };
            t._resetClientData();
            setInterval(() => {
                if (t.isReady && t.connected) {
                    var ws = t.websocket;
                    var clidata = t.currentClientData;
                    var localUpdates = [];
                    var globalUpdates = [];
                    //Local variable update loop.
                    //Only send variables that have been changed.
                    function checkLocalVars(id) {
                        if (typeof t._lastLocalVars[id] == "undefined") {
                            t._lastLocalVars[id] = {};
                        }
                        var lvars = t._lastLocalVars[id];
                        var vars = clidata.variables[id];
                        if (typeof vars == "undefined") {
                            vars = {};
                            clidata.variables[id] = vars;
                        }
                        for (var name of Object.keys(vars)) {
                            if (lvars[name] !== vars[name]) {
                                lvars[name] = vars[name];
                                localUpdates.push({
                                    name: name,
                                    value: vars[name],
                                    id: id
                                });
                            }
                        }
                    }
                    for (var id of Object.keys(clidata.variables)) {
                        checkLocalVars(id);
                    }
                    //Global variable update loop.
                    //Does almost the same as before, but for global variables.
                    var lvars = t._lastGlobalVars;
                    var vars = clidata.globalVariables;
                    for (var name of Object.keys(vars)) {
                        if (lvars[name] !== vars[name]) {
                            lvars[name] = vars[name];
                            globalUpdates.push({
                                name: name,
                                value: vars[name],
                            });
                        }
                    }
                    //Send out updates.
                    if (localUpdates.length > 0) { //Only send if their is something to actually send.
                        ws.send(JSON.stringify({
                            type: "sendUpdateLocalVars",
                            variables:localUpdates
                        }));
                    }
                    if (globalUpdates.length > 0) {
                        ws.send(JSON.stringify({
                            type: "sendUpdateGlobalVars",
                            variables:globalUpdates
                        }));
                    }
                }
            },1000/60); //Variable tracking rate, capped at 60 fps because i don't know it its possible to oversend to the server.
            t._handleMessage = function (data) {
                var ws = t.websocket;
                var json = JSON.parse(data.toString());
                var clidata = t.currentClientData;
                var lastLocalVars = t._lastLocalVars;
                var lastGlobalVars = t._lastGlobalVars;
                //Old version for compatibility.
                if (json.type == "updateGlobal") {
                    clidata.globalVariables[json.name] = json.value;
                    //No need to send update because it was already sent.
                    lastGlobalVars[json.name] = json.value;
                }
                if (json.type == "updateLocal") {
                    if (typeof clidata.variables[json.id] == "undefined") {
                        clidata.variables[json.id] = {};
                    }
                    clidata.variables[json.id][json.name] = json.value;
                    if (typeof lastLocalVars[json.id] == "undefined") {
                        lastLocalVars[json.id] = {};
                    }
                    //No need to send update because it was already sent.
                    lastLocalVars[json.id][json.name] = json.value;
                }
                //New version
                if (json.type == "updateGlobalVars") {
                    for (var variable of json.variables) {
                        clidata.globalVariables[variable.name] = variable.value;
                        //No need to send update because it was already sent.
                        lastGlobalVars[variable.name] = variable.value;
                    }
                }
                if (json.type == "updateLocalVars") {
                    for (var variable of json.variables) {
                        if (typeof clidata.variables[variable.id] == "undefined") {
                            clidata.variables[variable.id] = {};
                        }
                        clidata.variables[variable.id][variable.name] = variable.value;
                        if (typeof lastLocalVars[variable.id] == "undefined") {
                            lastLocalVars[variable.id] = {};
                        }
                        //No need to send update because it was already sent.
                        lastLocalVars[variable.id][variable.name] = variable.value;
                    }
                }
                if (json.type == "updateUserlist") {
                    var users = json.users;
                    if (typeof users == "object" && Array.isArray(users)) {
                        clidata.connectedUsers = users;
                    }
                    runtime.startHats(extid+"_whenUserListUpdated");
                }
                if (json.type == "newID") {
                    t.isReady = true;
                    clidata.id = json.id;
                    if (typeof clidata.variables[json.id] == "undefined") {
                        clidata.variables[json.id] = {};
                    }
                }
                if (json.type == "globalEvent") {
                    clidata.globalEventSentFrom = json.id;
                    clidata.globalEventValue = json.value;
                    t.globalEventsReceived[json.name] = true;
                }
                if (json.type == "localEvent") {
                    clidata.localEventSentFrom = json.id;
                    clidata.localEventValue = json.value;
                    t.localEventsReceived[json.name] = true;
                }
            };
            t._connectLoop = function () {
                if (t.inConnectLoop) {
                    return;
                } else {
                    t.inConnectLoop = true;
                }
                if (!t.requestedToConnect) {
                    return; //Connection loop ends here if the connection was closed and was actually wanting to be closed.
                }
                t.connected = false;
                t.isReady = false;
                t._resetClientData();
                var ws = new WebSocket(t.targetWebsocketURI);
                t.websocket = ws;
                ws.onopen = function () {
                    t.connected = true;
                };
                ws.onclose = function () {
                    t.connected = false;
                    t.isReady = false;
                    t.websocket = null;
                    t.inConnectLoop = false;
                    t._connectLoop();
                };
                ws.onmessage = function (e) {
                    t._handleMessage(e.data);
                };
            };
            t._closeConnectLoop = function () {
                if (!t.websocket) {
                    return; //Already closed, no need to close twice.
                }
                t.requestedToConnect = false;
                t.inConnectLoop = false;
                t.connected = false;
                t.isReady = false;
                t._resetClientData();
                var ws = t.websocket;
                ws.onclose = function () {}; //To prevent overlaps and stuff to avoid bugs.
                ws.close();
                t.websocket = null;
            };
        }

        getInfo () {
            return {
                id: extid,
                name: "Gvbvdxx Cloud",
                menus: {
				    settings: {
					    acceptReporters: false,
					    items: [
                            {
                                text: "Disconnect on project stop",
                                value: "OnProjectStop"
                            }
                        ]
                    }
                },
                blocks: [
                    {
                        opcode: "__NOUSEOPCODE",
                        blockType: BlockType.LABEL,
                        text: "NOTE: This is very different",
                    },
                    {
                        opcode: "__NOUSEOPCODE",
                        blockType: BlockType.LABEL,
                        text: "from the websockets extension,",
                    },
                    {
                        opcode: "__NOUSEOPCODE",
                        blockType: BlockType.LABEL,
                        text: "or cloud variables.",
                    },

                    {
                        opcode: 'connectCloud',
                        blockType: BlockType.COMMAND,
                        text: 'Connect to Gvbvdxx Cloud server [uri]',
                        arguments: {
                            uri: {
                                type: ArgumentType.STRING,
                                defaultValue: "wss://gvbvdxx-cloud-server.glitch.me/",
                            }
                        },
                    },
                    {
                        opcode: 'connectCloudAndWait',
                        blockType: BlockType.COMMAND,
                        text: 'Connect to Gvbvdxx Cloud server [uri] and wait for connection',
                        arguments: {
                            uri: {
                                type: ArgumentType.STRING,
                                defaultValue: "wss://gvbvdxx-cloud-server.glitch.me/",
                            }
                        },
                    },
                    {
                        opcode: 'disconnectCloud',
                        blockType: BlockType.COMMAND,
                        text: 'Disconnect from cloud server',
                        arguments: {
                        },
                    },
                    {
                        opcode: 'cloudURI',
                        blockType: BlockType.REPORTER,
                        text: 'Get current cloud server',
                        arguments: {
                        },
                    },
                    {
                        opcode: 'getIsConnected',
                        blockType: BlockType.BOOLEAN,
                        text: 'Is connected?',
                        arguments: {
                        },
                    },
                    {
                        opcode: 'getIsReady',
                        blockType: BlockType.BOOLEAN,
                        text: 'Server is ready?',
                        arguments: {
                        },
                    },
                    "---",
                    {
                        opcode: "__NOUSEOPCODE",
                        blockType: BlockType.LABEL,
                        text: "Global variables & events",
                    },
                    {
                        opcode: 'whenGlobalEventReceived',
                        blockType: BlockType.HAT,
                        text: 'When global event [EVENT_NAME] received',
                        arguments: {
                            EVENT_NAME: {
                                type: ArgumentType.STRING,
                                defaultValue: "global event"
                            }
                        },
                    },
                    {
                        opcode: 'getGlobalEventValue',
                        blockType: BlockType.REPORTER,
                        text: 'Global event value',
                        arguments: {
                        },
                    },
                    {
                        opcode: 'getGlobalEventSender',
                        blockType: BlockType.REPORTER,
                        text: 'Global event sender',
                        arguments: {
                        },
                    },
                    {
                        opcode: 'sendGlobalEvent',
                        blockType: BlockType.COMMAND,
                        text: 'Send global event [name] with value [value]',
                        arguments: {
                            name: {
                                type: ArgumentType.STRING,
                                defaultValue: "global event"
                            },
                            value: {
                                type: ArgumentType.STRING,
                                defaultValue: "a value that can be anything"
                            }
                        },
                    },
                    {
                        opcode: 'setGlobalVariable',
                        blockType: BlockType.COMMAND,
                        text: 'Set global variable [name] to [value]',
                        arguments: {
                            name: {
                                type: ArgumentType.STRING,
                                defaultValue: "my global variable"
                            },
                            value: {
                                type: ArgumentType.STRING,
                                defaultValue: "variable value"
                            }
                        },
                    },
                    {
                        opcode: 'getGlobalVariable',
                        blockType: BlockType.REPORTER,
                        text: 'Get global variable [name]',
                        arguments: {
                            name: {
                                type: ArgumentType.STRING,
                                defaultValue: "my global variable"
                            }
                        },
                    },
                    "---",
                    {
                        opcode: "__NOUSEOPCODE",
                        blockType: BlockType.LABEL,
                        text: "Local variables & events",
                    },
                    {
                        opcode: 'whenLocalEventReceived',
                        blockType: BlockType.HAT,
                        text: 'When local event [EVENT_NAME] received',
                        arguments: {
                            EVENT_NAME: {
                                type: ArgumentType.STRING,
                                defaultValue: "local event"
                            }
                        },
                    },
                    {
                        opcode: 'getLocalEventValue',
                        blockType: BlockType.REPORTER,
                        text: 'Local event value',
                        arguments: {
                        },
                    },
                    {
                        opcode: 'getLocalEventSender',
                        blockType: BlockType.REPORTER,
                        text: 'Local event sender',
                        arguments: {
                        },
                    },
                    {
                        opcode: 'sendLocalEvent',
                        blockType: BlockType.COMMAND,
                        text: 'Send local event [name] with value [value] to [id]',
                        arguments: {
                            name: {
                                type: ArgumentType.STRING,
                                defaultValue: "local event"
                            },
                            value: {
                                type: ArgumentType.STRING,
                                defaultValue: "a value that can be anything"
                            },
                            id: {
                                type: ArgumentType.STRING,
                                defaultValue: "user id"
                            }
                        },
                    },
                    {
                        opcode: 'setLocalVariable',
                        blockType: BlockType.COMMAND,
                        text: 'Set User ID [id] local variable [name] to [value]',
                        arguments: {
                            name: {
                                type: ArgumentType.STRING,
                                defaultValue: "my local variable"
                            },
                            value: {
                                type: ArgumentType.STRING,
                                defaultValue: "variable value"
                            },
                            id: {
                                type: ArgumentType.STRING,
                                defaultValue: "user id"
                            }
                        },
                    },
                    {
                        opcode: 'getLocalVariable',
                        blockType: BlockType.REPORTER,
                        text: 'Get local variable [name] from User ID [id]',
                        arguments: {
                            name: {
                                type: ArgumentType.STRING,
                                defaultValue: "my local variable"
                            },
                            id: {
                                type: ArgumentType.STRING,
                                defaultValue: "user id"
                            }
                        },
                    },
                    {
                        opcode: 'setMyLocalVariable',
                        blockType: BlockType.COMMAND,
                        text: 'Set my local variable [name] to [value]',
                        arguments: {
                            name: {
                                type: ArgumentType.STRING,
                                defaultValue: "my local variable"
                            },
                            value: {
                                type: ArgumentType.STRING,
                                defaultValue: "variable value"
                            }
                        },
                    },
                    {
                        opcode: 'getMyLocalVariable',
                        blockType: BlockType.REPORTER,
                        text: 'Get my local variable [name]',
                        arguments: {
                            name: {
                                type: ArgumentType.STRING,
                                defaultValue: "my local variable"
                            }
                        },
                    },
                    "---",
                    {
                        opcode: "__NOUSEOPCODE",
                        blockType: BlockType.LABEL,
                        text: "User IDs",
                    },
                    {
                        opcode: 'getUserCount',
                        blockType: BlockType.REPORTER,
                        text: 'Number of users connected',
                        arguments: {
                        },
                    },
                    {
                        opcode: 'getUserIdFromIndex',
                        blockType: BlockType.REPORTER,
                        text: 'Get user ID from number [userIndex]',
                        arguments: {
                            userIndex: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 1
                            }
                        },
                    },
                    {
                        opcode: 'getMyId',
                        blockType: BlockType.REPORTER,
                        text: 'Get my user ID',
                        arguments: {},
                    },
                    {
                        opcode: 'isUserOnline',
                        blockType: BlockType.BOOLEAN,
                        text: 'Is User ID [id] online?',
                        arguments: {
                            id: {
                                type: ArgumentType.STRING,
                                defaultValue: "user id"
                            }
                        },
                    },
                    {
                        opcode: 'whenUserListUpdated',
                        isEdgeActivated: false,
                        shouldRestartExistingThreads: true,
                        blockType: BlockType.EVENT,
                        text: 'When the user list is updated',
                        arguments: {
                        },
                    },
                    "---",
                    {
                        opcode: "setClientSetting",
                        blockType: BlockType.COMMAND,
                        text: "Set setting [SETTING] to [VALUE]",
                        arguments: {
                            SETTING:  {
                                acceptReporters: false,
                                menu: "settings",
                            },
                            VALUE: {
                                type: ArgumentType.BOOLEAN,
                                defaultValue: false
                            }
                        }
                    },
                    {
                        opcode: "getClientSetting",
                        blockType: BlockType.REPORTER,
                        text: "Get setting [SETTING]",
                        arguments: {
                            SETTING:  {
                                acceptReporters: false,
                                menu: "settings",
                            }
                        }
                    }
                ]
            };
        }
        whenUserListUpdated () {
            return;
        }

        cloudURI () {
            return this.targetWebsocketURI;
        }
        getIsConnected () {
            return this.connected;
        }
        getIsReady () {
            return this.isReady;
        }

        connectCloud (args) {
            try{
                this.targetWebsocketURI = Cast.toString(args.uri);
                this._closeConnectLoop();
                this.requestedToConnect = true;
                this._connectLoop();
            }catch(e){
                this.targetWebsocketURI = "";
            }
        }

        connectCloudAndWait (args) {
            try{
                this.targetWebsocketURI = Cast.toString(args.uri);
                this._closeConnectLoop();
                this.requestedToConnect = true;
                this._connectLoop();
                var t = this;
                return new Promise((accept) => {
                    var inter = setInterval(() => {
                        if (t.connected) {
                            accept();
                            clearInterval(inter);
                        }
                    });
                });
            }catch(e){
                this.targetWebsocketURI = "";
            }
        }

        disconnectCloud (args) {
            try {
                this._closeConnectLoop();
            }catch(e){
                //Do nothing here.
            }
        }

        whenGlobalEventReceived (args) {
            var eventName = Cast.toString(args.EVENT_NAME);
            if (this.globalEventsReceived[eventName]) {
                return true;
            } else {
                return false;
            }
        }

        whenLocalEventReceived (args) {
            var eventName = Cast.toString(args.EVENT_NAME);
            if (this.localEventsReceived[eventName]) {
                return true;
            } else {
                return false;
            }
        }

        getGlobalEventValue (args) {
            return this.currentClientData.globalEventValue;
        }

        getLocalEventValue (args) {
            return this.currentClientData.localEventValue;
        }

        getGlobalEventSender (args) {
            return this.currentClientData.globalEventSentFrom;
        }

        getLocalEventSender (args) {
            return this.currentClientData.localEventSentFrom;
        }

        sendGlobalEvent (args) {
            var name = Cast.toString(args.name);
            var value = Cast.toString(args.value);

            if (this.connected && this.isReady) {
                this.websocket.send(JSON.stringify({
                    type: "globalEventSend",
                    name: name,
                    value: value
                }));
            }
        }

        sendLocalEvent (args) {
            var name = Cast.toString(args.name);
            var value = Cast.toString(args.value);
            var id = Cast.toString(args.id);

            if (this.connected && this.isReady) {
                this.websocket.send(JSON.stringify({
                    type: "localEventSend",
                    name: name,
                    value: value,
                    to: id
                }));
            }
        }

        getUserCount () {
            return this.currentClientData.connectedUsers.length;
        }
        getUserIdFromIndex (args) {
            var id = this.currentClientData.connectedUsers[Cast.toNumber(args.userIndex)-1];
            if (typeof id == "string") {
                return id;
            } else {
                return ""; //All items in the connectedUsers array should be string, otherwise it might be out of range. 
            }
        }
        getMyId () {
            var id = this.currentClientData.id;
            if (typeof id == "string") {
                return id;
            } else {
                return ""; //Usually means no id.
            }
        }
        isUserOnline (args) {
            var id = Cast.toString(args.id);
            if (this.currentClientData.connectedUsers.indexOf(id) > -1) {
                return true;
            } else {
                return false;
            }
        }

        setGlobalVariable (args) {
            var name = Cast.toString(args.name);
            var value = args.value;
            if (this.connected && this.isReady) {
                this.currentClientData.globalVariables[name] = value;
                return;
            }
            return;
        }

        getGlobalVariable (args) {
            var name = Cast.toString(args.name);
            if (this.connected && this.isReady) {
                var value = this.currentClientData.globalVariables[name];
                if (typeof value == "undefined") {
                    return "";
                }
                return value;
            }
            return "";
        }

        setLocalVariable (args) {
            var name = Cast.toString(args.name);
            var id = Cast.toString(args.id);
            var value = args.value;
            if (this.connected && this.isReady) {
                var clidata = this.currentClientData;
                if (typeof clidata.variables[id] == "undefined") {
                    clidata.variables[id] = {};
                }
                clidata.variables[id][name] = value;
                return;
            }
            return;
        }

        getLocalVariable (args) {
            var name = Cast.toString(args.name);
            var id = Cast.toString(args.id);
            if (this.connected && this.isReady) {
                var clidata = this.currentClientData;
                if (typeof clidata.variables[id] == "undefined") {
                    return "";
                }
                if (typeof clidata.variables[id][name] == "undefined") {
                    return "";
                }
                return clidata.variables[id][name];
            }
            return "";
        }

        setMyLocalVariable (args) {
            var name = Cast.toString(args.name);
            var value = args.value;
            if (this.connected && this.isReady) {
                var clidata = this.currentClientData;
                var id = clidata.id;
                if (typeof clidata.variables[id] == "undefined") {
                    clidata.variables[id] = {};
                }
                clidata.variables[id][name] = value;
                return;
            }
            return;
        }

        getMyLocalVariable (args) {
            var name = Cast.toString(args.name);
            if (this.connected && this.isReady) {
                var clidata = this.currentClientData;
                var id = clidata.id;
                if (typeof clidata.variables[id] == "undefined") {
                    return "";
                }
                if (typeof clidata.variables[id][name] == "undefined") {
                    return "";
                }
                return clidata.variables[id][name];
            }
            return "";
        }

        setClientSetting (args) {
            var setting = Cast.toString(args.SETTING);
            var value = Cast.toBoolean(args.VALUE);

            if (setting == "OnProjectStop") {
                this.disconnectOnProjectStop = value;
            }
        }

        getClientSetting (args) {
            var setting = Cast.toString(args.SETTING);

            if (setting == "OnProjectStop") {
                return this.disconnectOnProjectStop;
            }
            return false;
        }
    }

    Scratch.extensions.register(new GvbvdxxCloud());
})(Scratch);
