var ws = require("ws");

var wss = new ws.WebSocketServer({ noServer: true });
var idNumber = 0;
var globalVariables = {};

function sendMessageToAllClients(msg) {
  wss.clients.forEach((client) => {
    client.send(msg);
  });
}
function sendNewUserlist() {
  var userlist = [];
  for (var client of wss.clients) {
    userlist.push(client.localID);
  }
  sendMessageToAllClients(
    JSON.stringify({
      type: "updateUserlist",
      users: userlist,
    })
  );
}

var cs = {
  globalVariables: globalVariables,
  setVariable: function (name, value) {
    globalVariables[name] = value;
  },
  getVariable: function (name, value) {
    return globalVariables[name];
  },
  setLocalVariable: function (localId, name, value) {
    for (var cli of wss.clients) {
      if (cli.localID == localId) {
        cli.localVariables[name] = value;
      }
    }
  },
  getLocalVariable: function (localId, name) {
    for (var cli of wss.clients) {
      if (cli.localID == localId) {
        return cli.localVariables[name];
      }
    }
  },
  sendGlobalEvent: function (name, value, fromID) {
    var id = fromID || "SERVER";
    sendMessageToAllClients(
      JSON.stringify({
        type: "globalEvent",
        name: name,
        value: value,
        id: id,
      })
    );
  },
  getUsers: function () {
    var userlist = [];
    for (var client of wss.clients) {
      userlist.push(client.localID);
    }
    return userlist;
  },
  sendLocalEvent: function (name, value, toID, fromID) {
    var fid = fromID || "SERVER";
    var tid = toID || "SERVER";

    for (var cli of wss.clients) {
      if (tid == cli.localID) {
        cli.send(
          JSON.stringify({
            type: "localEvent",
            name: name,
            value: value,
            id: fid,
          })
        );
      }
    }
  },
  onGlobalEvent: function (name,value,from) {}
};

wss.on("connection", (ws) => {
  var wsOpen = true;
  idNumber += 1;
  ws.localID = idNumber.toString() + "_" + Math.round(Math.random() * 10000);
  sendNewUserlist();
  ws.gvbhandshakeReturned = false;
  ws.localVariables = {};
  ws._lastLocalVariables = {};
  ws._lastGlobalVariables = {};
  ws._doVariableTick = function () {
    var localUpdates = [];
    var globalUpdates = [];
    //Local variables
    for (var cli of wss.clients) {
      var locid = ws.localID;
      if (typeof cli._lastLocalVariables[locid] == "undefined") {
        cli._lastLocalVariables[locid] = {};
      }
      var lastlocalvars = cli._lastLocalVariables[locid];
      var localvars = cli.localVariables;
      for (var name of Object.keys(localvars)) {
        if (lastlocalvars[name] !== localvars[name]) {
          lastlocalvars[name] = localvars[name];
          localUpdates.push({
            id: cli.localID,
            name: name,
            value: localvars[name],
          });
        }
      }
    }
    //Global variables.
    var lastGlobalVar = ws._lastGlobalVariables;
    for (var name of Object.keys(globalVariables)) {
      if (lastGlobalVar[name] !== globalVariables[name]) {
        lastGlobalVar[name] = globalVariables[name];
        globalUpdates.push({
          name: name,
          value: globalVariables[name],
        });
      }
    }
    //Send out updates.
    if (localUpdates.length > 0) {
      ws.send(
        JSON.stringify({
          type: "updateLocalVars",
          variables: localUpdates,
        })
      );
    }
    if (globalUpdates.length > 0) {
      ws.send(
        JSON.stringify({
          type: "updateGlobalVars",
          variables: globalUpdates,
        })
      );
    }
  };
  ws.on("message", (data) => {
    try {
      var json = JSON.parse(data.toString());
      if (json.type == "sendUpdateGlobal") {
        globalVariables[json.name] = json.value;
      }
      if (json.type == "sendUpdateLocal") {
        for (var cli of wss.clients) {
          if (cli.localID == json.id) {
            cli.localVariables[json.name] = json.value;
          }
        }
      }
      if (json.type == "sendUpdateGlobalVars") {
        if (
          typeof json.variables == "object" &&
          Array.isArray(json.variables)
        ) {
          for (var variable of json.variables) {
            globalVariables[variable.name] = variable.value;
          }
        }
      }
      if (json.type == "sendUpdateLocalVars") {
        if (
          typeof json.variables == "object" &&
          Array.isArray(json.variables)
        ) {
          for (var variable of json.variables) {
            for (var cli of wss.clients) {
              if (cli.localID == variable.id) {
                cli.localVariables[variable.name] = variable.value;
              }
            }
          }
        }
      }
      if (json.type == "globalEventSend") {
        cs.onGlobalEvent(json.name,json.value,ws.localID);
        sendMessageToAllClients(
          JSON.stringify({
            type: "globalEvent",
            name: json.name,
            value: json.value,
            id: ws.localID,
          })
        );
      }
      if (json.type == "localEventSend") {
        for (var cli of wss.clients) {
          if (json.to == cli.localID) {
            cli.send(
              JSON.stringify({
                type: "localEvent",
                name: json.name,
                value: json.value,
                id: ws.localID,
              })
            );
          }
        }
      }
    } catch (e) {
      console.log(`Client JSON parse error on message: ${e}`);
    }
  });
  ws.on("close", () => {
    idNumber -= 1;
    wsOpen = false;
    sendNewUserlist();
  });
});

setInterval(() => {
  for (var cli of wss.clients) {
    cli._doVariableTick();
  }
  for (var cli of wss.clients) {
    if (!cli.gvbhandshakeReturned) {
      cli.gvbhandshakeReturned = true;
      cli.send(
        JSON.stringify({
          type: "newID",
          id: cli.localID,
        })
      );
    }
  }
}, 1000 / 60);

wss._gvbvdxxCloudServer = cs;

module.exports = wss;
