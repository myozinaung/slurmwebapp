var Operation = require('../Operation.js');
var shellescape = require('shell-escape');
var inherits = require('util').inherits;

var config = require('../../config');

function ContentFileOperation() {
    this.files = {};
    Operation.call(this);
}
inherits(ContentFileOperation, Operation);

// Overwrite
ContentFileOperation.prototype.makeOperation =
function(client, operationInfo, clientCallback) {
    path = operationInfo.params.path;
    var self = this;

    // Request file size
    this.executeFilesizeRequest(client, path,
        // Error filesize
        function(exitcode){
            if(exitcode == 1)
                clientCallback(null, {type:"not_exist"});
        },
        // Filesize received
        function(filesize, path){
            if(filesize > config.general.max_filesize_transfer)
                clientCallback(null, {type:"too_big"});
            else
                self.executeReadFile(client, path, operationInfo.notifyEventName,
                clientCallback);
        }
    );
};

ContentFileOperation.prototype.showReaders =
function(){
    console.log("================ Files Content PID ================== ");
    for(token in this.files){
        console.log(' -- ' + token + ' : ' + this.files[token].length);
        for(i=0;i<this.files[token].length;i++){
            console.log('  -> ' + this.files[token][i]);
        }
    }
    console.log("================ ================= ================== ");
}


ContentFileOperation.prototype.executeFilesizeRequest =
function(client, filename, callbackError, callbackResult){
    //(command, dataCallback, exitCallback, endCallback, stdErrCallbak)
    var filesize = null;
    client.executeCustomCommand(shellescape(['stat', '-c%s',filename]),
        // data
        function(data) {
            if(filesize == null){
                filesize = parseInt(data.slice(0, -1));
            }
        },
        // exit
        function(exitcode) {
            callbackError(exitcode);
        },
        // end
        function(){
            callbackResult(filesize, filename);
        }
    );
}

ContentFileOperation.prototype.onQuitClient =
function(client) {
    if(this.files[client.socket.id] != undefined)
        for(i = 0;i<this.files[client.socket.id].length;i++){
            this.endReadFile(client, this.files[client.socket.id][i]);
        }
    this.showReaders();
};

ContentFileOperation.prototype.endReadFile =
function(client, pid) {
    this.showReaders();
    if(pid != null){
        console.log("Kill file tail pid : " + pid);
        client.killProcess(pid);
        this.files[client.socket.id].splice(
            this.files[client.socket.id].indexOf(pid),
            1);

        if(this.files[client.socket.id].length == 0){
            delete this.files[client.socket.id];
        }
    }
    this.showReaders();
};

// Execute tail read file
ContentFileOperation.prototype.executeReadFile =
function(client, filename, notifyEventName, clientCallback){
    var pid = null;
    var fileSize = null;
    var self = this;

    function endExecuteReadFile(){
        console.log("disconnect:'"+notifyEventName+"'");
        self.endReadFile(client, pid);
    }

    var command = shellescape(['test','-f',filename]) +
        '&& echo "PID: $$"&&'+
        shellescape(['tail','-n','+0','-f','--follow=name','--retry',filename]);

    // Execute tail after get PID
    client.executeCustomCommand(command,
        // data
        function(data) {
            data = data.toString();
            console.log("DATA:"+data);
            // Get the pid and regiter killprocess event
            if(pid == null && data.substr( 0, 5 ) === 'PID: ' ){
                pid = data.substr(5).slice(0, -1);
                client.socket.on('end '+notifyEventName, endExecuteReadFile);
                if(self.files[client.socket.id] == undefined)
                    self.files[client.socket.id] = [];
                self.files[client.socket.id].push(pid);
            }
            // Get the data
            else{
                data = data.toString();
                client.socket.emit(notifyEventName, {err:false, data:data});
            }
        },
        // exit
        function(exitcode) {
            //console.log("EXIT:"+exitcode);
        },
        // end
        function(){
            client.socket.removeAllListeners('end '+notifyEventName);
        },
        // std err
        function(data) {
            console.log("STDERR:"+data);
            clientCallback(null, {type:data});
            endExecuteReadFile();
        }
    );

}

// export the class
module.exports = ContentFileOperation;
