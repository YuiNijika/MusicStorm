#pragma once

#include <nlohmann/json.hpp>

#include <string>
#include <vector>

namespace ksm_contract_detail {

using Json = nlohmann::json;

inline const Json& ArgSchemas() {
    static const Json schemas = Json::parse(R"KSMSCHEMA({
  "ping": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  },
  "capabilities.query": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  },
  "app.getInfo": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  },
  "device.getInfo": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  },
  "fs.readText": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "minLength": 1
      }
    },
    "required": [
      "path"
    ],
    "additionalProperties": false
  },
  "fs.writeText": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "minLength": 1
      },
      "content": {
        "type": "string",
        "maxBytes": 16777216
      }
    },
    "required": [
      "path",
      "content"
    ],
    "additionalProperties": false
  },
  "fs.exists": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "minLength": 1
      }
    },
    "required": [
      "path"
    ],
    "additionalProperties": false
  },
  "fs.remove": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "minLength": 1
      }
    },
    "required": [
      "path"
    ],
    "additionalProperties": false
  },
  "fs.readDir": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "minLength": 1
      }
    },
    "required": [
      "path"
    ],
    "additionalProperties": false
  },
  "fs.mkdir": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "minLength": 1
      },
      "recursive": {
        "type": "boolean"
      }
    },
    "required": [
      "path"
    ],
    "additionalProperties": false
  },
  "fs.stat": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "minLength": 1
      }
    },
    "required": [
      "path"
    ],
    "additionalProperties": false
  },
  "fs.appendText": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "minLength": 1
      },
      "content": {
        "type": "string",
        "maxBytes": 16777216
      }
    },
    "required": [
      "path",
      "content"
    ],
    "additionalProperties": false
  },
  "fs.copy": {
    "type": "object",
    "properties": {
      "from": {
        "type": "string",
        "minLength": 1
      },
      "to": {
        "type": "string",
        "minLength": 1
      }
    },
    "required": [
      "from",
      "to"
    ],
    "additionalProperties": false
  },
  "fs.move": {
    "type": "object",
    "properties": {
      "from": {
        "type": "string",
        "minLength": 1
      },
      "to": {
        "type": "string",
        "minLength": 1
      }
    },
    "required": [
      "from",
      "to"
    ],
    "additionalProperties": false
  },
  "fs.readBytes": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "minLength": 1
      }
    },
    "required": [
      "path"
    ],
    "additionalProperties": false
  },
  "fs.writeBytes": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "minLength": 1
      },
      "base64": {
        "type": "string",
        "maxBytes": 33554432
      }
    },
    "required": [
      "path",
      "base64"
    ],
    "additionalProperties": false
  },
  "dialog.message": {
    "type": "object",
    "properties": {
      "title": {
        "type": "string"
      },
      "message": {
        "type": "string"
      }
    },
    "required": [
      "title",
      "message"
    ],
    "additionalProperties": false
  },
  "dialog.confirm": {
    "type": "object",
    "properties": {
      "title": {
        "type": "string"
      },
      "message": {
        "type": "string"
      }
    },
    "required": [
      "title",
      "message"
    ],
    "additionalProperties": false
  },
  "dialog.openFile": {
    "type": "object",
    "properties": {
      "filters": {
        "type": "array",
        "items": {
          "type": "string"
        }
      }
    },
    "required": [],
    "additionalProperties": false
  },
  "dialog.saveFile": {
    "type": "object",
    "properties": {
      "suggestedName": {
        "type": "string"
      }
    },
    "required": [],
    "additionalProperties": false
  },
  "clipboard.readText": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  },
  "clipboard.writeText": {
    "type": "object",
    "properties": {
      "text": {
        "type": "string"
      }
    },
    "required": [
      "text"
    ],
    "additionalProperties": false
  },
  "notification.show": {
    "type": "object",
    "properties": {
      "title": {
        "type": "string"
      },
      "body": {
        "type": "string"
      }
    },
    "required": [
      "title",
      "body"
    ],
    "additionalProperties": false
  },
  "permission.request": {
    "type": "object",
    "properties": {
      "permission": {
        "type": "string",
        "minLength": 1
      }
    },
    "required": [
      "permission"
    ],
    "additionalProperties": false
  },
  "event.subscribe": {
    "type": "object",
    "properties": {
      "event": {
        "type": "string",
        "minLength": 1
      }
    },
    "required": [
      "event"
    ],
    "additionalProperties": false
  },
  "event.unsubscribe": {
    "type": "object",
    "properties": {
      "event": {
        "type": "string",
        "minLength": 1
      }
    },
    "required": [
      "event"
    ],
    "additionalProperties": false
  },
  "window.setTitle": {
    "type": "object",
    "properties": {
      "title": {
        "type": "string"
      }
    },
    "required": [
      "title"
    ],
    "additionalProperties": false
  },
  "window.minimize": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  },
  "window.maximize": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  },
  "window.setSize": {
    "type": "object",
    "properties": {
      "width": {
        "type": "integer"
      },
      "height": {
        "type": "integer"
      }
    },
    "required": [
      "width",
      "height"
    ],
    "additionalProperties": false
  },
  "window.startDragging": {
    "type": "object",
    "properties": {
      "windowId": {
        "type": "string"
      }
    },
    "required": [],
    "additionalProperties": false
  },
  "window.startResizing": {
    "type": "object",
    "properties": {
      "direction": {
        "type": "string",
        "enum": [
          "top",
          "bottom",
          "left",
          "right",
          "topLeft",
          "topRight",
          "bottomLeft",
          "bottomRight"
        ]
      },
      "windowId": {
        "type": "string"
      }
    },
    "required": [
      "direction"
    ],
    "additionalProperties": false
  },
  "window.close": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  },
  "shell.openExternal": {
    "type": "object",
    "properties": {
      "url": {
        "type": "string",
        "minLength": 1
      }
    },
    "required": [
      "url"
    ],
    "additionalProperties": false
  },
  "shell.openPath": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "minLength": 1
      }
    },
    "required": [
      "path"
    ],
    "additionalProperties": false
  },
  "shell.showInFolder": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "minLength": 1
      }
    },
    "required": [
      "path"
    ],
    "additionalProperties": false
  },
  "app.singleInstance.state": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  },
  "app.singleInstance.focus": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  },
  "tray.show": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  },
  "tray.hide": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  },
  "globalShortcut.register": {
    "type": "object",
    "properties": {
      "shortcut": {
        "type": "string",
        "minLength": 1,
        "maxBytes": 256
      }
    },
    "required": [
      "shortcut"
    ],
    "additionalProperties": false
  },
  "globalShortcut.unregister": {
    "type": "object",
    "properties": {
      "shortcut": {
        "type": "string",
        "minLength": 1,
        "maxBytes": 256
      }
    },
    "required": [
      "shortcut"
    ],
    "additionalProperties": false
  },
  "updater.check": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  },
  "updater.download": {
    "type": "object",
    "properties": {
      "version": {
        "type": "string",
        "minLength": 1,
        "maxBytes": 128
      }
    },
    "required": [
      "version"
    ],
    "additionalProperties": false
  },
  "http.download": {
    "type": "object",
    "properties": {
      "url": {
        "type": "string",
        "minLength": 1
      },
      "path": {
        "type": "string",
        "minLength": 1
      },
      "overwrite": {
        "type": "boolean"
      }
    },
    "required": [
      "url",
      "path"
    ],
    "additionalProperties": false
  },
  "sql.drivers": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  },
  "sql.open": {
    "type": "object",
    "properties": {
      "driver": {
        "type": "string",
        "enum": [
          "sqlite",
          "mysql",
          "postgres",
          "mongodb"
        ]
      },
      "url": {
        "type": "string",
        "minLength": 1,
        "maxBytes": 4096
      }
    },
    "required": [
      "driver",
      "url"
    ],
    "additionalProperties": false
  },
  "sql.query": {
    "type": "object",
    "properties": {
      "connectionId": {
        "type": "string",
        "minLength": 1
      },
      "statement": {
        "type": "string",
        "minLength": 1,
        "maxBytes": 1048576
      },
      "params": {
        "type": "array",
        "items": {
          "type": [
            "string",
            "number",
            "boolean",
            "null"
          ]
        }
      }
    },
    "required": [
      "connectionId",
      "statement"
    ],
    "additionalProperties": false
  },
  "sql.execute": {
    "type": "object",
    "properties": {
      "connectionId": {
        "type": "string",
        "minLength": 1
      },
      "statement": {
        "type": "string",
        "minLength": 1,
        "maxBytes": 1048576
      },
      "params": {
        "type": "array",
        "items": {
          "type": [
            "string",
            "number",
            "boolean",
            "null"
          ]
        }
      }
    },
    "required": [
      "connectionId",
      "statement"
    ],
    "additionalProperties": false
  },
  "sql.close": {
    "type": "object",
    "properties": {
      "connectionId": {
        "type": "string",
        "minLength": 1
      }
    },
    "required": [
      "connectionId"
    ],
    "additionalProperties": false
  },
  "path.dirs": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  },
  "path.join": {
    "type": "object",
    "properties": {
      "base": {
        "type": "string",
        "minLength": 1
      },
      "segments": {
        "type": "array",
        "items": {
          "type": "string",
          "minLength": 1,
          "maxBytes": 256
        }
      }
    },
    "required": [
      "base",
      "segments"
    ],
    "additionalProperties": false
  },
  "path.normalize": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "minLength": 1,
        "maxBytes": 8192
      }
    },
    "required": [
      "path"
    ],
    "additionalProperties": false
  },
  "path.dirname": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "minLength": 1,
        "maxBytes": 8192
      }
    },
    "required": [
      "path"
    ],
    "additionalProperties": false
  },
  "path.basename": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "minLength": 1,
        "maxBytes": 8192
      },
      "suffix": {
        "type": "string",
        "maxBytes": 256
      }
    },
    "required": [
      "path"
    ],
    "additionalProperties": false
  },
  "path.extname": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "minLength": 1,
        "maxBytes": 8192
      }
    },
    "required": [
      "path"
    ],
    "additionalProperties": false
  },
  "path.isAbsolute": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "minLength": 1,
        "maxBytes": 8192
      }
    },
    "required": [
      "path"
    ],
    "additionalProperties": false
  },
  "store.get": {
    "type": "object",
    "properties": {
      "key": {
        "type": "string",
        "minLength": 1,
        "maxBytes": 256
      }
    },
    "required": [
      "key"
    ],
    "additionalProperties": false
  },
  "store.set": {
    "type": "object",
    "properties": {
      "key": {
        "type": "string",
        "minLength": 1,
        "maxBytes": 256
      },
      "value": {
        "type": [
          "object",
          "array",
          "string",
          "number",
          "boolean",
          "null"
        ]
      }
    },
    "required": [
      "key",
      "value"
    ],
    "additionalProperties": false
  },
  "store.delete": {
    "type": "object",
    "properties": {
      "key": {
        "type": "string",
        "minLength": 1,
        "maxBytes": 256
      }
    },
    "required": [
      "key"
    ],
    "additionalProperties": false
  },
  "store.clear": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  },
  "store.keys": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  },
  "os.getInfo": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  },
  "log.write": {
    "type": "object",
    "properties": {
      "level": {
        "type": "string",
        "enum": [
          "trace",
          "debug",
          "info",
          "warn",
          "error"
        ]
      },
      "message": {
        "type": "string",
        "minLength": 1,
        "maxBytes": 65536
      },
      "target": {
        "type": "string",
        "minLength": 1,
        "maxBytes": 128
      }
    },
    "required": [
      "level",
      "message"
    ],
    "additionalProperties": false
  },
  "app.exit": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  },
  "http.request": {
    "type": "object",
    "properties": {
      "url": {
        "type": "string",
        "minLength": 1
      },
      "method": {
        "type": "string",
        "enum": [
          "GET",
          "POST"
        ]
      },
      "headers": {
        "type": "object"
      },
      "body": {
        "type": "string"
      },
      "timeoutMs": {
        "type": "integer"
      }
    },
    "required": [
      "url"
    ],
    "additionalProperties": false
  },
  "http.transfer.start": {
    "type": "object",
    "properties": {
      "url": {
        "type": "string",
        "minLength": 1
      },
      "method": {
        "type": "string",
        "enum": [
          "GET",
          "POST"
        ]
      },
      "headers": {
        "type": "object"
      },
      "body": {
        "type": "string"
      },
      "path": {
        "type": "string"
      },
      "overwrite": {
        "type": "boolean"
      },
      "jarId": {
        "type": "string"
      },
      "userAgent": {
        "type": "string"
      },
      "referer": {
        "type": "string"
      }
    },
    "required": [
      "url",
      "path"
    ],
    "additionalProperties": false
  },
  "http.transfer.cancel": {
    "type": "object",
    "properties": {
      "transferId": {
        "type": "string"
      }
    },
    "required": [
      "transferId"
    ],
    "additionalProperties": false
  },
  "http.cookies.get": {
    "type": "object",
    "properties": {
      "url": {
        "type": "string"
      },
      "jarId": {
        "type": "string"
      }
    },
    "required": [
      "url",
      "jarId"
    ],
    "additionalProperties": false
  },
  "http.cookies.set": {
    "type": "object",
    "properties": {
      "url": {
        "type": "string"
      },
      "jarId": {
        "type": "string"
      },
      "cookies": {
        "type": "array",
        "items": {
          "type": "object"
        }
      }
    },
    "required": [
      "url",
      "jarId",
      "cookies"
    ],
    "additionalProperties": false
  },
  "http.cookies.clear": {
    "type": "object",
    "properties": {
      "url": {
        "type": "string"
      },
      "jarId": {
        "type": "string"
      }
    },
    "required": [
      "url",
      "jarId"
    ],
    "additionalProperties": false
  },
  "dialog.openFolder": {
    "type": "object",
    "properties": {
      "persist": {
        "type": "boolean"
      },
      "filters": {
        "type": "object"
      }
    },
    "required": [],
    "additionalProperties": false
  },
  "dialog.openFiles": {
    "type": "object",
    "properties": {
      "filters": {
        "type": "array",
        "items": {
          "type": "string"
        }
      }
    },
    "required": [],
    "additionalProperties": false
  },
  "fs.walk": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string"
      },
      "maxDepth": {
        "type": "integer"
      },
      "filter": {
        "type": "object"
      }
    },
    "required": [
      "path"
    ],
    "additionalProperties": false
  },
  "fs.scope.release": {
    "type": "object",
    "properties": {
      "scopeId": {
        "type": "string"
      }
    },
    "required": [
      "scopeId"
    ],
    "additionalProperties": false
  },
  "media.probe": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string"
      }
    },
    "required": [
      "path"
    ],
    "additionalProperties": false
  },
  "media.ffmpeg.detect": {
    "type": "object",
    "properties": {
      "name": {
        "type": "string"
      }
    },
    "required": [],
    "additionalProperties": false
  },
  "media.ffmpeg.validate": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string"
      }
    },
    "required": [
      "path"
    ],
    "additionalProperties": false
  },
  "media.ffmpeg.setPath": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string"
      },
      "name": {
        "type": "string"
      }
    },
    "required": [
      "path"
    ],
    "additionalProperties": false
  },
  "media.ffmpeg.pickExecutable": {
    "type": "object",
    "properties": {
      "name": {
        "type": "string"
      }
    },
    "required": [],
    "additionalProperties": false
  },
  "audio.devices.list": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  },
  "audio.devices.set": {
    "type": "object",
    "properties": {
      "deviceId": {
        "type": "string"
      }
    },
    "required": [
      "deviceId"
    ],
    "additionalProperties": false
  },
  "audio.output.getMode": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  },
  "audio.output.setExclusive": {
    "type": "object",
    "properties": {
      "exclusive": {
        "type": "boolean"
      }
    },
    "required": [
      "exclusive"
    ],
    "additionalProperties": false
  },
  "audio.eq.set": {
    "type": "object",
    "properties": {
      "gains": {
        "type": "array",
        "items": {
          "type": "number"
        }
      }
    },
    "required": [
      "gains"
    ],
    "additionalProperties": false
  },
  "audio.speed.set": {
    "type": "object",
    "properties": {
      "speed": {
        "type": "number"
      }
    },
    "required": [
      "speed"
    ],
    "additionalProperties": false
  },
  "audio.probe": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string"
      }
    },
    "required": [
      "path"
    ],
    "additionalProperties": false
  },
  "audio.load": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string"
      }
    },
    "required": [
      "path"
    ],
    "additionalProperties": false
  },
  "audio.play": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  },
  "audio.pause": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  },
  "audio.stop": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  },
  "audio.seek": {
    "type": "object",
    "properties": {
      "positionMs": {
        "type": "integer"
      }
    },
    "required": [
      "positionMs"
    ],
    "additionalProperties": false
  },
  "audio.volume.set": {
    "type": "object",
    "properties": {
      "volume": {
        "type": "number"
      }
    },
    "required": [
      "volume"
    ],
    "additionalProperties": false
  },
  "audio.state.get": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  },
  "mediaSession.update": {
    "type": "object",
    "properties": {
      "title": {
        "type": "string"
      },
      "artist": {
        "type": "string"
      },
      "album": {
        "type": "string"
      },
      "artwork": {
        "type": "string"
      },
      "durationMs": {
        "type": [
          "number",
          "null"
        ]
      },
      "positionMs": {
        "type": [
          "number",
          "null"
        ]
      },
      "state": {
        "type": "string"
      }
    },
    "required": [
      "title"
    ],
    "additionalProperties": false
  },
  "mediaSession.clear": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  },
  "window.create": {
    "type": "object",
    "properties": {
      "route": {
        "type": "string"
      },
      "url": {
        "type": "string"
      },
      "title": {
        "type": "string"
      },
      "width": {
        "type": "integer"
      },
      "height": {
        "type": "integer"
      },
      "x": {
        "type": "integer"
      },
      "y": {
        "type": "integer"
      },
      "visible": {
        "type": "boolean"
      },
      "alwaysOnTop": {
        "type": "boolean"
      },
      "transparent": {
        "type": "boolean"
      },
      "resizable": {
        "type": "boolean"
      },
      "decorations": {
        "type": "boolean"
      }
    },
    "required": [],
    "additionalProperties": false
  },
  "window.show": {
    "type": "object",
    "properties": {
      "windowId": {
        "type": "string"
      }
    },
    "required": [
      "windowId"
    ],
    "additionalProperties": false
  },
  "window.hide": {
    "type": "object",
    "properties": {
      "windowId": {
        "type": "string"
      }
    },
    "required": [
      "windowId"
    ],
    "additionalProperties": false
  },
  "window.setPosition": {
    "type": "object",
    "properties": {
      "windowId": {
        "type": "string"
      },
      "x": {
        "type": "integer"
      },
      "y": {
        "type": "integer"
      }
    },
    "required": [
      "windowId",
      "x",
      "y"
    ],
    "additionalProperties": false
  },
  "window.setAlwaysOnTop": {
    "type": "object",
    "properties": {
      "windowId": {
        "type": "string"
      },
      "enabled": {
        "type": "boolean"
      }
    },
    "required": [
      "windowId",
      "enabled"
    ],
    "additionalProperties": false
  },
  "window.setTransparent": {
    "type": "object",
    "properties": {
      "windowId": {
        "type": "string"
      },
      "enabled": {
        "type": "boolean"
      }
    },
    "required": [
      "windowId",
      "enabled"
    ],
    "additionalProperties": false
  },
  "window.getState": {
    "type": "object",
    "properties": {
      "windowId": {
        "type": "string"
      }
    },
    "required": [
      "windowId"
    ],
    "additionalProperties": false
  },
  "event.emit": {
    "type": "object",
    "properties": {
      "event": {
        "type": "string"
      },
      "payload": {
        "type": "object"
      },
      "windowId": {
        "type": "string"
      }
    },
    "required": [
      "event"
    ],
    "additionalProperties": false
  },
  "tray.configure": {
    "type": "object",
    "properties": {
      "icon": {
        "type": "string"
      },
      "tooltip": {
        "type": "string"
      },
      "items": {
        "type": "array",
        "items": {
          "type": "object"
        }
      }
    },
    "required": [],
    "additionalProperties": false
  },
  "updater.install": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string"
      },
      "version": {
        "type": "string"
      },
      "hash": {
        "type": "string"
      },
      "signature": {
        "type": "string"
      }
    },
    "required": [
      "path",
      "version"
    ],
    "additionalProperties": false
  },
  "app.openDevtools": {
    "type": "object",
    "properties": {
      "enabled": {
        "type": "boolean"
      }
    },
    "required": [],
    "additionalProperties": false
  },
  "app.deepLink.getPending": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  }
})KSMSCHEMA");
    return schemas;
}

inline bool MatchesType(const Json& value, const std::string& type) {
    if (type == "object") return value.is_object();
    if (type == "array") return value.is_array();
    if (type == "string") return value.is_string();
    if (type == "number") return value.is_number();
    if (type == "integer") return value.is_number_integer() || value.is_number_unsigned();
    if (type == "boolean") return value.is_boolean();
    if (type == "null") return value.is_null();
    return false;
}

inline bool SameValue(const Json& left, const Json& right) {
    return left == right;
}

inline bool ValidateValue(const Json& value, const Json& schema) {
    if (!schema.contains("type")) return false;
    const Json& type = schema.at("type");
    bool matches = false;
    if (type.is_string()) {
        matches = MatchesType(value, type.get<std::string>());
    } else if (type.is_array()) {
        for (const auto& item : type) {
            if (item.is_string() && MatchesType(value, item.get<std::string>())) {
                matches = true;
                break;
            }
        }
    }
    if (!matches) return false;

    if (schema.contains("enum")) {
        bool found = false;
        for (const auto& candidate : schema.at("enum")) {
            if (SameValue(candidate, value)) {
                found = true;
                break;
            }
        }
        if (!found) return false;
    }
    if (schema.contains("const") && !SameValue(schema.at("const"), value)) {
        return false;
    }

    if (value.is_object()) {
        const Json properties = schema.value("properties", Json::object());
        if (schema.contains("required")) {
            for (const auto& field : schema.at("required")) {
                if (!value.contains(field.get<std::string>())) return false;
            }
        }
        if (schema.value("additionalProperties", true) == false) {
            for (const auto& [field, unused] : value.items()) {
                (void)unused;
                if (!properties.contains(field)) return false;
            }
        }
        for (const auto& [field, property_schema] : properties.items()) {
            if (value.contains(field) && !ValidateValue(value.at(field), property_schema)) {
                return false;
            }
        }
    }

    if (value.is_array() && schema.contains("items")) {
        for (const auto& item : value) {
            if (!ValidateValue(item, schema.at("items"))) return false;
        }
    }

    if (value.is_string()) {
        const std::string text = value.get<std::string>();
        if (schema.contains("minLength") && text.size() < schema.at("minLength").get<std::size_t>()) {
            return false;
        }
        if (schema.contains("maxBytes") && text.size() > schema.at("maxBytes").get<std::size_t>()) {
            return false;
        }
    }
    return true;
}

}  // namespace ksm_contract_detail

class KSMGeneratedContract {
public:
    static const std::vector<std::string>& Commands();
    static const std::vector<std::string>& WindowsCommands();
    static const std::vector<std::string>& AndroidCommands();
    static const std::vector<std::string>& Events();
    static const std::vector<std::string>& Permissions();
    static const std::vector<std::string>& Plugins();
    static const nlohmann::json& PluginMetadata();
    static const nlohmann::json& PluginCommands();
    static const nlohmann::json& CommandPermissions();
    static bool ValidateArgs(const std::string& command, const nlohmann::json& args);
};

inline const std::vector<std::string>& KSMGeneratedContract::Commands() {
    static const std::vector<std::string> values = {
        "ping", "capabilities.query", "app.getInfo", "device.getInfo", "fs.readText", "fs.writeText", "fs.exists", "fs.remove", "fs.readDir", "fs.mkdir", "fs.stat", "fs.appendText", "fs.copy", "fs.move", "fs.readBytes", "fs.writeBytes", "dialog.message", "dialog.confirm", "dialog.openFile", "dialog.saveFile", "clipboard.readText", "clipboard.writeText", "notification.show", "permission.request", "event.subscribe", "event.unsubscribe", "window.setTitle", "window.minimize", "window.maximize", "window.setSize", "window.startDragging", "window.startResizing", "window.close", "shell.openExternal", "shell.openPath", "shell.showInFolder", "app.singleInstance.state", "app.singleInstance.focus", "tray.show", "tray.hide", "globalShortcut.register", "globalShortcut.unregister", "updater.check", "updater.download", "http.download", "sql.drivers", "sql.open", "sql.query", "sql.execute", "sql.close", "path.dirs", "path.join", "path.normalize", "path.dirname", "path.basename", "path.extname", "path.isAbsolute", "store.get", "store.set", "store.delete", "store.clear", "store.keys", "os.getInfo", "log.write", "app.exit", "http.request", "http.transfer.start", "http.transfer.cancel", "http.cookies.get", "http.cookies.set", "http.cookies.clear", "dialog.openFolder", "dialog.openFiles", "fs.walk", "fs.scope.release", "media.probe", "media.ffmpeg.detect", "media.ffmpeg.validate", "media.ffmpeg.setPath", "media.ffmpeg.pickExecutable", "audio.devices.list", "audio.devices.set", "audio.output.getMode", "audio.output.setExclusive", "audio.eq.set", "audio.speed.set", "audio.probe", "audio.load", "audio.play", "audio.pause", "audio.stop", "audio.seek", "audio.volume.set", "audio.state.get", "mediaSession.update", "mediaSession.clear", "window.create", "window.show", "window.hide", "window.setPosition", "window.setAlwaysOnTop", "window.setTransparent", "window.getState", "event.emit", "tray.configure", "updater.install", "app.openDevtools", "app.deepLink.getPending"
    };
    return values;
}

inline const std::vector<std::string>& KSMGeneratedContract::WindowsCommands() {
    static const std::vector<std::string> values = {
        "ping", "capabilities.query", "app.getInfo", "fs.readText", "fs.writeText", "fs.exists", "fs.remove", "fs.readDir", "fs.mkdir", "fs.stat", "fs.appendText", "fs.copy", "fs.move", "fs.readBytes", "fs.writeBytes", "dialog.message", "dialog.confirm", "dialog.openFile", "dialog.saveFile", "clipboard.readText", "clipboard.writeText", "notification.show", "permission.request", "event.subscribe", "event.unsubscribe", "window.setTitle", "window.minimize", "window.maximize", "window.setSize", "window.startDragging", "window.startResizing", "window.close", "shell.openExternal", "shell.openPath", "shell.showInFolder", "app.singleInstance.state", "app.singleInstance.focus", "tray.show", "tray.hide", "globalShortcut.register", "globalShortcut.unregister", "updater.check", "updater.download", "http.download", "sql.drivers", "sql.open", "sql.query", "sql.execute", "sql.close", "path.dirs", "path.join", "path.normalize", "path.dirname", "path.basename", "path.extname", "path.isAbsolute", "store.get", "store.set", "store.delete", "store.clear", "store.keys", "os.getInfo", "log.write", "app.exit", "http.request", "http.transfer.start", "http.transfer.cancel", "http.cookies.get", "http.cookies.set", "http.cookies.clear", "dialog.openFolder", "dialog.openFiles", "fs.walk", "fs.scope.release", "media.probe", "media.ffmpeg.detect", "media.ffmpeg.validate", "media.ffmpeg.setPath", "media.ffmpeg.pickExecutable", "audio.devices.list", "audio.devices.set", "audio.output.getMode", "audio.output.setExclusive", "audio.eq.set", "audio.speed.set", "audio.probe", "audio.load", "audio.play", "audio.pause", "audio.stop", "audio.seek", "audio.volume.set", "audio.state.get", "window.create", "window.show", "window.hide", "window.setPosition", "window.setAlwaysOnTop", "window.setTransparent", "window.getState", "event.emit", "tray.configure", "updater.install", "app.openDevtools"
    };
    return values;
}

inline const std::vector<std::string>& KSMGeneratedContract::AndroidCommands() {
    static const std::vector<std::string> values = {
        "ping", "capabilities.query", "app.getInfo", "device.getInfo", "fs.readText", "fs.writeText", "fs.exists", "fs.remove", "fs.readDir", "fs.mkdir", "fs.stat", "fs.appendText", "fs.copy", "fs.move", "fs.readBytes", "fs.writeBytes", "dialog.message", "dialog.confirm", "dialog.openFile", "dialog.saveFile", "clipboard.readText", "clipboard.writeText", "notification.show", "permission.request", "event.subscribe", "event.unsubscribe", "window.close", "shell.openExternal", "shell.openPath", "shell.showInFolder", "app.singleInstance.state", "app.singleInstance.focus", "updater.check", "updater.download", "http.download", "sql.drivers", "sql.open", "sql.query", "sql.execute", "sql.close", "path.dirs", "path.join", "path.normalize", "path.dirname", "path.basename", "path.extname", "path.isAbsolute", "store.get", "store.set", "store.delete", "store.clear", "store.keys", "os.getInfo", "log.write", "app.exit", "http.request", "http.transfer.start", "http.transfer.cancel", "http.cookies.get", "http.cookies.set", "http.cookies.clear", "dialog.openFolder", "dialog.openFiles", "fs.walk", "fs.scope.release", "media.probe", "media.ffmpeg.detect", "media.ffmpeg.validate", "audio.devices.list", "audio.devices.set", "audio.output.getMode", "audio.eq.set", "audio.speed.set", "audio.probe", "audio.load", "audio.play", "audio.pause", "audio.stop", "audio.seek", "audio.volume.set", "audio.state.get", "mediaSession.update", "mediaSession.clear", "event.emit", "updater.install", "app.openDevtools", "app.deepLink.getPending"
    };
    return values;
}

inline const std::vector<std::string>& KSMGeneratedContract::Events() {
    static const std::vector<std::string> values = {
        "webview.navigated", "webview.reloaded", "window.resized", "http.transfer.progress", "http.transfer.completed", "http.transfer.failed", "audio.tick", "audio.ended", "audio.stateChanged", "audio.error", "mediaSession.command", "window.visibilityChanged", "window.stateChanged", "tray.action", "tray.click", "globalShortcut.triggered", "updater.progress", "updater.status", "app.deepLink.received", "app.secondInstance.received"
    };
    return values;
}

inline const std::vector<std::string>& KSMGeneratedContract::Permissions() {
    static const std::vector<std::string> values = {
        "fs.read", "fs.write", "fs.remove", "dialog", "clipboard.read", "clipboard.write", "notification.show", "window.control", "http.download", "shell.open", "device.info", "sql", "store", "os.info", "log.write", "updater", "globalShortcut", "tray", "http.request", "http.cookies", "http.transfer", "media.read", "media.control", "media.probe", "audio.play", "mediaSession", "window.manage", "tray.configure", "updater.install", "app.deepLink", "app.devtools"
    };
    return values;
}

inline const std::vector<std::string>& KSMGeneratedContract::Plugins() {
    static const std::vector<std::string> values = {
        "core", "fs", "dialog", "clipboard", "notification", "window", "http", "shell", "device", "sql", "path", "store", "os", "log", "appInstance", "updater", "globalShortcut", "tray", "media", "audio", "mediaSession"
    };
    return values;
}

inline const nlohmann::json& KSMGeneratedContract::PluginMetadata() {
    static const nlohmann::json value = nlohmann::json::parse(
        R"KSMMETADATA({
  "core": {
    "name": "Core",
    "version": "1.0.0",
    "description": "Application lifecycle, permissions, events and capability discovery.",
    "frontendPackage": "kasumi-bridge",
    "platforms": [
      "windows",
      "android"
    ],
    "permissions": [
      "app.deepLink",
      "app.devtools",
      "window.control"
    ],
    "defaultPermissions": [
      "app.deepLink",
      "app.devtools",
      "window.control"
    ],
    "commands": [
      "ping",
      "capabilities.query",
      "app.getInfo",
      "app.exit",
      "permission.request",
      "event.subscribe",
      "event.unsubscribe",
      "app.openDevtools",
      "app.deepLink.getPending"
    ]
  },
  "fs": {
    "name": "Filesystem",
    "version": "1.0.0",
    "description": "Sandboxed virtual filesystem access.",
    "frontendPackage": "kasumi-plugin-fs",
    "platforms": [
      "windows",
      "android"
    ],
    "permissions": [
      "fs.read",
      "fs.remove",
      "fs.write"
    ],
    "defaultPermissions": [
      "fs.read",
      "fs.remove",
      "fs.write"
    ],
    "commands": [
      "fs.readText",
      "fs.writeText",
      "fs.appendText",
      "fs.copy",
      "fs.move",
      "fs.readBytes",
      "fs.writeBytes",
      "fs.exists",
      "fs.remove",
      "fs.readDir",
      "fs.mkdir",
      "fs.stat",
      "fs.walk",
      "fs.scope.release"
    ]
  },
  "dialog": {
    "name": "Dialog",
    "version": "1.0.0",
    "description": "Native message, confirmation and file picker dialogs.",
    "frontendPackage": "kasumi-plugin-dialog",
    "platforms": [
      "windows",
      "android"
    ],
    "permissions": [
      "dialog"
    ],
    "defaultPermissions": [
      "dialog"
    ],
    "commands": [
      "dialog.message",
      "dialog.confirm",
      "dialog.openFile",
      "dialog.saveFile",
      "dialog.openFolder",
      "dialog.openFiles"
    ]
  },
  "clipboard": {
    "name": "Clipboard",
    "version": "1.0.0",
    "description": "System clipboard text access.",
    "frontendPackage": "kasumi-plugin-clipboard",
    "platforms": [
      "windows",
      "android"
    ],
    "permissions": [
      "clipboard.read",
      "clipboard.write"
    ],
    "defaultPermissions": [
      "clipboard.read",
      "clipboard.write"
    ],
    "commands": [
      "clipboard.readText",
      "clipboard.writeText"
    ]
  },
  "notification": {
    "name": "Notification",
    "version": "1.0.0",
    "description": "Native system notifications.",
    "frontendPackage": "kasumi-plugin-notification",
    "platforms": [
      "windows",
      "android"
    ],
    "permissions": [
      "notification.show"
    ],
    "defaultPermissions": [
      "notification.show"
    ],
    "commands": [
      "notification.show"
    ]
  },
  "window": {
    "name": "Window",
    "version": "1.0.0",
    "description": "Window title, size, lifecycle and application exit controls.",
    "frontendPackage": "kasumi-plugin-window",
    "platforms": [
      "windows",
      "android"
    ],
    "permissions": [
      "window.control",
      "window.manage"
    ],
    "defaultPermissions": [
      "window.control",
      "window.manage"
    ],
    "commands": [
      "window.setTitle",
      "window.minimize",
      "window.maximize",
      "window.setSize",
      "window.startDragging",
      "window.startResizing",
      "window.close",
      "window.create",
      "window.show",
      "window.hide",
      "window.setPosition",
      "window.setAlwaysOnTop",
      "window.setTransparent",
      "window.getState",
      "event.emit"
    ]
  },
  "http": {
    "name": "HTTP",
    "version": "1.0.0",
    "description": "HTTPS downloads into the virtual filesystem.",
    "frontendPackage": "kasumi-plugin-http",
    "platforms": [
      "windows",
      "android"
    ],
    "permissions": [
      "http.cookies",
      "http.download",
      "http.request"
    ],
    "defaultPermissions": [
      "http.cookies",
      "http.download",
      "http.request"
    ],
    "commands": [
      "http.download",
      "http.request",
      "http.transfer.start",
      "http.transfer.cancel",
      "http.cookies.get",
      "http.cookies.set",
      "http.cookies.clear"
    ]
  },
  "shell": {
    "name": "Shell",
    "version": "1.4.0",
    "description": "Allowlisted external URL launching.",
    "frontendPackage": "kasumi-plugin-shell",
    "platforms": [
      "windows",
      "android"
    ],
    "permissions": [
      "shell.open"
    ],
    "defaultPermissions": [
      "shell.open"
    ],
    "commands": [
      "shell.openExternal",
      "shell.openPath",
      "shell.showInFolder"
    ]
  },
  "device": {
    "name": "Device",
    "version": "1.0.0",
    "description": "Non-identifying Android device information.",
    "frontendPackage": "kasumi-plugin-device",
    "platforms": [
      "android"
    ],
    "permissions": [
      "device.info"
    ],
    "defaultPermissions": [
      "device.info"
    ],
    "commands": [
      "device.getInfo"
    ]
  },
  "sql": {
    "name": "SQL",
    "version": "1.2.0",
    "description": "Database connections and parameterised SQL statements.",
    "frontendPackage": "kasumi-plugin-sql",
    "platforms": [
      "windows",
      "android"
    ],
    "permissions": [
      "sql"
    ],
    "defaultPermissions": [
      "sql"
    ],
    "commands": [
      "sql.drivers",
      "sql.open",
      "sql.query",
      "sql.execute",
      "sql.close"
    ]
  },
  "path": {
    "name": "Path",
    "version": "1.3.0",
    "description": "Virtual application path inspection and construction.",
    "frontendPackage": "kasumi-plugin-path",
    "platforms": [
      "windows",
      "android"
    ],
    "permissions": [],
    "defaultPermissions": [],
    "commands": [
      "path.dirs",
      "path.join",
      "path.normalize",
      "path.dirname",
      "path.basename",
      "path.extname",
      "path.isAbsolute"
    ]
  },
  "store": {
    "name": "Store",
    "version": "1.3.0",
    "description": "Persistent JSON key-value storage inside application data.",
    "frontendPackage": "kasumi-plugin-store",
    "platforms": [
      "windows",
      "android"
    ],
    "permissions": [
      "store"
    ],
    "defaultPermissions": [
      "store"
    ],
    "commands": [
      "store.get",
      "store.set",
      "store.delete",
      "store.clear",
      "store.keys"
    ]
  },
  "os": {
    "name": "OS",
    "version": "1.3.0",
    "description": "Non-identifying operating system and runtime information.",
    "frontendPackage": "kasumi-plugin-os",
    "platforms": [
      "windows",
      "android"
    ],
    "permissions": [
      "os.info"
    ],
    "defaultPermissions": [
      "os.info"
    ],
    "commands": [
      "os.getInfo"
    ]
  },
  "log": {
    "name": "Log",
    "version": "1.3.0",
    "description": "Platform logger access with bounded messages.",
    "frontendPackage": "kasumi-plugin-log",
    "platforms": [
      "windows",
      "android"
    ],
    "permissions": [
      "log.write"
    ],
    "defaultPermissions": [
      "log.write"
    ],
    "commands": [
      "log.write"
    ]
  },
  "appInstance": {
    "name": "App Instance",
    "version": "1.4.0",
    "description": "Single instance state and focus coordination.",
    "frontendPackage": "kasumi-bridge",
    "platforms": [
      "windows",
      "android"
    ],
    "permissions": [],
    "defaultPermissions": [],
    "commands": [
      "app.singleInstance.state",
      "app.singleInstance.focus"
    ]
  },
  "updater": {
    "name": "Updater",
    "version": "1.4.0",
    "description": "Check and download application update packages.",
    "frontendPackage": "kasumi-plugin-updater",
    "platforms": [
      "windows",
      "android"
    ],
    "permissions": [
      "updater",
      "updater.install"
    ],
    "defaultPermissions": [
      "updater",
      "updater.install"
    ],
    "commands": [
      "updater.check",
      "updater.download",
      "updater.install"
    ]
  },
  "globalShortcut": {
    "name": "Global Shortcut",
    "version": "1.4.0",
    "description": "Register and unregister global keyboard shortcuts.",
    "frontendPackage": "kasumi-plugin-global-shortcut",
    "platforms": [
      "windows"
    ],
    "permissions": [
      "globalShortcut"
    ],
    "defaultPermissions": [
      "globalShortcut"
    ],
    "commands": [
      "globalShortcut.register",
      "globalShortcut.unregister"
    ]
  },
  "tray": {
    "name": "Tray",
    "version": "1.4.0",
    "description": "Show and hide the system tray icon.",
    "frontendPackage": "kasumi-plugin-tray",
    "platforms": [
      "windows"
    ],
    "permissions": [
      "tray",
      "tray.configure"
    ],
    "defaultPermissions": [
      "tray",
      "tray.configure"
    ],
    "commands": [
      "tray.show",
      "tray.hide",
      "tray.configure"
    ]
  },
  "media": {
    "name": "Media",
    "version": "1.5.0",
    "description": "Media metadata, external tool discovery, and virtual media scopes.",
    "frontendPackage": "kasumi-plugin-media",
    "platforms": [
      "windows",
      "android"
    ],
    "permissions": [
      "media.read"
    ],
    "defaultPermissions": [
      "media.read"
    ],
    "commands": [
      "media.probe",
      "media.ffmpeg.detect",
      "media.ffmpeg.validate",
      "media.ffmpeg.setPath",
      "media.ffmpeg.pickExecutable"
    ]
  },
  "audio": {
    "name": "Audio",
    "version": "1.5.0",
    "description": "Audio playback, device selection, effects, and state.",
    "frontendPackage": "kasumi-plugin-audio",
    "platforms": [
      "windows",
      "android"
    ],
    "permissions": [
      "media.control",
      "media.read"
    ],
    "defaultPermissions": [
      "media.control",
      "media.read"
    ],
    "commands": [
      "audio.devices.list",
      "audio.devices.set",
      "audio.output.getMode",
      "audio.output.setExclusive",
      "audio.eq.set",
      "audio.speed.set",
      "audio.probe",
      "audio.load",
      "audio.play",
      "audio.pause",
      "audio.stop",
      "audio.seek",
      "audio.volume.set",
      "audio.state.get"
    ]
  },
  "mediaSession": {
    "name": "Media Session",
    "version": "1.5.0",
    "description": "System media session metadata and transport commands.",
    "frontendPackage": "kasumi-plugin-media-session",
    "platforms": [
      "android"
    ],
    "permissions": [
      "mediaSession"
    ],
    "defaultPermissions": [
      "mediaSession"
    ],
    "commands": [
      "mediaSession.update",
      "mediaSession.clear"
    ]
  }
})KSMMETADATA"
    );
    return value;
}

inline const nlohmann::json& KSMGeneratedContract::PluginCommands() {
    static const nlohmann::json value = nlohmann::json::parse(
        R"KSMPLUGINS({
  "core": [
    "ping",
    "capabilities.query",
    "app.getInfo",
    "app.exit",
    "permission.request",
    "event.subscribe",
    "event.unsubscribe",
    "app.openDevtools",
    "app.deepLink.getPending"
  ],
  "fs": [
    "fs.readText",
    "fs.writeText",
    "fs.appendText",
    "fs.copy",
    "fs.move",
    "fs.readBytes",
    "fs.writeBytes",
    "fs.exists",
    "fs.remove",
    "fs.readDir",
    "fs.mkdir",
    "fs.stat",
    "fs.walk",
    "fs.scope.release"
  ],
  "dialog": [
    "dialog.message",
    "dialog.confirm",
    "dialog.openFile",
    "dialog.saveFile",
    "dialog.openFolder",
    "dialog.openFiles"
  ],
  "clipboard": [
    "clipboard.readText",
    "clipboard.writeText"
  ],
  "notification": [
    "notification.show"
  ],
  "window": [
    "window.setTitle",
    "window.minimize",
    "window.maximize",
    "window.setSize",
    "window.startDragging",
    "window.startResizing",
    "window.close",
    "window.create",
    "window.show",
    "window.hide",
    "window.setPosition",
    "window.setAlwaysOnTop",
    "window.setTransparent",
    "window.getState",
    "event.emit"
  ],
  "http": [
    "http.download",
    "http.request",
    "http.transfer.start",
    "http.transfer.cancel",
    "http.cookies.get",
    "http.cookies.set",
    "http.cookies.clear"
  ],
  "shell": [
    "shell.openExternal",
    "shell.openPath",
    "shell.showInFolder"
  ],
  "device": [
    "device.getInfo"
  ],
  "sql": [
    "sql.drivers",
    "sql.open",
    "sql.query",
    "sql.execute",
    "sql.close"
  ],
  "path": [
    "path.dirs",
    "path.join",
    "path.normalize",
    "path.dirname",
    "path.basename",
    "path.extname",
    "path.isAbsolute"
  ],
  "store": [
    "store.get",
    "store.set",
    "store.delete",
    "store.clear",
    "store.keys"
  ],
  "os": [
    "os.getInfo"
  ],
  "log": [
    "log.write"
  ],
  "appInstance": [
    "app.singleInstance.state",
    "app.singleInstance.focus"
  ],
  "updater": [
    "updater.check",
    "updater.download",
    "updater.install"
  ],
  "globalShortcut": [
    "globalShortcut.register",
    "globalShortcut.unregister"
  ],
  "tray": [
    "tray.show",
    "tray.hide",
    "tray.configure"
  ],
  "media": [
    "media.probe",
    "media.ffmpeg.detect",
    "media.ffmpeg.validate",
    "media.ffmpeg.setPath",
    "media.ffmpeg.pickExecutable"
  ],
  "audio": [
    "audio.devices.list",
    "audio.devices.set",
    "audio.output.getMode",
    "audio.output.setExclusive",
    "audio.eq.set",
    "audio.speed.set",
    "audio.probe",
    "audio.load",
    "audio.play",
    "audio.pause",
    "audio.stop",
    "audio.seek",
    "audio.volume.set",
    "audio.state.get"
  ],
  "mediaSession": [
    "mediaSession.update",
    "mediaSession.clear"
  ]
})KSMPLUGINS"
    );
    return value;
}

inline const nlohmann::json& KSMGeneratedContract::CommandPermissions() {
    static const nlohmann::json value = nlohmann::json::parse(
        R"KSMPERMISSIONS({
  "ping": [],
  "capabilities.query": [],
  "app.getInfo": [],
  "device.getInfo": [
    "device.info"
  ],
  "fs.readText": [
    "fs.read"
  ],
  "fs.writeText": [
    "fs.write"
  ],
  "fs.exists": [
    "fs.read"
  ],
  "fs.remove": [
    "fs.remove"
  ],
  "fs.readDir": [
    "fs.read"
  ],
  "fs.mkdir": [
    "fs.write"
  ],
  "fs.stat": [
    "fs.read"
  ],
  "fs.appendText": [
    "fs.write"
  ],
  "fs.copy": [
    "fs.read",
    "fs.write"
  ],
  "fs.move": [
    "fs.write"
  ],
  "fs.readBytes": [
    "fs.read"
  ],
  "fs.writeBytes": [
    "fs.write"
  ],
  "dialog.message": [
    "dialog"
  ],
  "dialog.confirm": [
    "dialog"
  ],
  "dialog.openFile": [
    "dialog"
  ],
  "dialog.saveFile": [
    "dialog"
  ],
  "clipboard.readText": [
    "clipboard.read"
  ],
  "clipboard.writeText": [
    "clipboard.write"
  ],
  "notification.show": [
    "notification.show"
  ],
  "permission.request": [],
  "event.subscribe": [],
  "event.unsubscribe": [],
  "window.setTitle": [
    "window.control"
  ],
  "window.minimize": [
    "window.control"
  ],
  "window.maximize": [
    "window.control"
  ],
  "window.setSize": [
    "window.control"
  ],
  "window.startDragging": [
    "window.control"
  ],
  "window.startResizing": [
    "window.control"
  ],
  "window.close": [
    "window.control"
  ],
  "shell.openExternal": [
    "shell.open"
  ],
  "shell.openPath": [
    "shell.open"
  ],
  "shell.showInFolder": [
    "shell.open"
  ],
  "app.singleInstance.state": [],
  "app.singleInstance.focus": [],
  "tray.show": [
    "tray"
  ],
  "tray.hide": [
    "tray"
  ],
  "globalShortcut.register": [
    "globalShortcut"
  ],
  "globalShortcut.unregister": [
    "globalShortcut"
  ],
  "updater.check": [
    "updater"
  ],
  "updater.download": [
    "updater"
  ],
  "http.download": [
    "http.download"
  ],
  "sql.drivers": [
    "sql"
  ],
  "sql.open": [
    "sql"
  ],
  "sql.query": [
    "sql"
  ],
  "sql.execute": [
    "sql"
  ],
  "sql.close": [
    "sql"
  ],
  "path.dirs": [],
  "path.join": [],
  "path.normalize": [],
  "path.dirname": [],
  "path.basename": [],
  "path.extname": [],
  "path.isAbsolute": [],
  "store.get": [
    "store"
  ],
  "store.set": [
    "store"
  ],
  "store.delete": [
    "store"
  ],
  "store.clear": [
    "store"
  ],
  "store.keys": [
    "store"
  ],
  "os.getInfo": [
    "os.info"
  ],
  "log.write": [
    "log.write"
  ],
  "app.exit": [
    "window.control"
  ],
  "http.request": [
    "http.request"
  ],
  "http.transfer.start": [
    "http.request"
  ],
  "http.transfer.cancel": [
    "http.request"
  ],
  "http.cookies.get": [
    "http.cookies"
  ],
  "http.cookies.set": [
    "http.cookies"
  ],
  "http.cookies.clear": [
    "http.cookies"
  ],
  "dialog.openFolder": [
    "dialog"
  ],
  "dialog.openFiles": [
    "dialog"
  ],
  "fs.walk": [
    "fs.read"
  ],
  "fs.scope.release": [
    "fs.read"
  ],
  "media.probe": [
    "media.read"
  ],
  "media.ffmpeg.detect": [
    "media.read"
  ],
  "media.ffmpeg.validate": [
    "media.read"
  ],
  "media.ffmpeg.setPath": [
    "media.read"
  ],
  "media.ffmpeg.pickExecutable": [
    "media.read"
  ],
  "audio.devices.list": [
    "media.read"
  ],
  "audio.devices.set": [
    "media.control"
  ],
  "audio.output.getMode": [
    "media.read"
  ],
  "audio.output.setExclusive": [
    "media.control"
  ],
  "audio.eq.set": [
    "media.control"
  ],
  "audio.speed.set": [
    "media.control"
  ],
  "audio.probe": [
    "media.read"
  ],
  "audio.load": [
    "media.control"
  ],
  "audio.play": [
    "media.control"
  ],
  "audio.pause": [
    "media.control"
  ],
  "audio.stop": [
    "media.control"
  ],
  "audio.seek": [
    "media.control"
  ],
  "audio.volume.set": [
    "media.control"
  ],
  "audio.state.get": [
    "media.read"
  ],
  "mediaSession.update": [
    "mediaSession"
  ],
  "mediaSession.clear": [
    "mediaSession"
  ],
  "window.create": [
    "window.manage"
  ],
  "window.show": [
    "window.manage"
  ],
  "window.hide": [
    "window.manage"
  ],
  "window.setPosition": [
    "window.manage"
  ],
  "window.setAlwaysOnTop": [
    "window.manage"
  ],
  "window.setTransparent": [
    "window.manage"
  ],
  "window.getState": [
    "window.manage"
  ],
  "event.emit": [
    "window.manage"
  ],
  "tray.configure": [
    "tray.configure"
  ],
  "updater.install": [
    "updater.install"
  ],
  "app.openDevtools": [
    "app.devtools"
  ],
  "app.deepLink.getPending": [
    "app.deepLink"
  ]
})KSMPERMISSIONS"
    );
    return value;
}

inline bool KSMGeneratedContract::ValidateArgs(
    const std::string& command,
    const nlohmann::json& args
) {
    const auto& schemas = ksm_contract_detail::ArgSchemas();
    if (!schemas.contains(command)) return false;
    return ksm_contract_detail::ValidateValue(args, schemas.at(command));
}
