var forever         = require('forever'),
    path            = require('path'),
    extend          = require('util')._extend,
    logDir          = path.join(process.cwd(), '/forever'),
    logFile         = path.join(logDir, '/log.log'),
    outFile         = path.join(logDir, '/out.log'),    
    errFile         = path.join(logDir, '/err.log'),
    commandName     = 'node',
    commandMap      = {
      start     :   startForeverWithIndex,
      stop      :   stopOnProcess,
      restart   :   restartOnProcess,
      list      :   listOfProcess
    },
    nodemailer      = require('nodemailer'),
    mailOptions     = {
      from      :   null,                         // sender address
      to        :   null,                         // list of receivers
      subject   :   'Nodemailer Subject',         // Subject line
      text      :   'Nodemailer Text',            // plaintext body
      html      :   '<b>Nodemailer HTML Text</b>' // html body
    },
    mailerTransport = {
      type      :   'SMTP'
      , service :   'Gmail'
      , user    :   null
      , pass    :   null
    },
    smtpTransport, done, gruntRef, max, commandFinish;

/**
 * Logs message to console using log.writeln() from grunt.
 * @param  {String} message Message to print with log formatting.
 */
function log( message ) {
  gruntRef.log.writeln( message );
}
/**
 * Logs message to console using warn() from grunt.
 * @param  {String} message Message to print with warn formatting.
 */
function warn( message ) {
  gruntRef.warn( message );
}
/**
 * Logs message to console using log.error() and raises error from grunt.
 * @param  {String} message Message to print in error formatting.
 */
function error( message ) {
  gruntRef.log.error( message ).error();
}
/**
 * Pretty prints supplied object in JSON notation using grunt logging.
 * @param  {String} id     String description of object
 * @param  {Object} object Generic Object to be JSON-ified.
 */
function prettyPrint( id, object ) {
  log(id + ' : ' + JSON.stringify(object, null, 2));
}
/**
 * Locates running process previously started by forever based on index file, and notifies callback. Will notify of undefined if not found, other wise the unformatted process object.
 * @param  {String}   index    Index filename.
 * @param  {Function} callback Delegate method to invoke with either the found process object or undefined if not found.
 */
function findProcessWithIndex( index, callback ) {
  var i, process;
  try {
    forever.list(false, function(context, list) {
      i = list ? list.length : 0;
      while( --i > -1 ) {
        process = list[i];
        if( process.hasOwnProperty('file') &&
          process.file === index ) {
          break;
        }
        process = undefined;
      }

      callback.call(null, process);
    });
  }
  catch( e ) {
    error( 'Error in trying to find process ' + index + ' in forever. [REASON] :: ' + e.message );
    callback.call(null, undefined);
  }
}
/**
 * Attempts to get list of processes
 */
function listOfProcess() {
  log( 'Attempting to get list of daemons.');

  done = this.async();
  var i, process;
  try {
    forever.list(false, function(context, list) {
      if (!list) {
        log( 'The list of processes in forever is empty.' );
        done();
      } else {
        i = list.length;
        while( --i > -1 ) {
          process = list[i];
          if ( process.hasOwnProperty('file') ) log( forever.format(true, [process]) );
        }
        done();
      }
    });
  }
  catch( e ) {
    error( 'Error in trying to get list in forever. [REASON] :: ' + e.message );
  }
}
/**
 * Attempts to start process using the index file.
 * @param  {String} index Filename.
 */
function startForeverWithIndex( index ) {
  log( 'Attempting to start ' + index + ' as daemon.');

  done = this.async();
  findProcessWithIndex( index, function(process) {
    // if found, be on our way without failing.
    if( typeof process !== 'undefined' ) {
      warn( index + ' is already running.');
      log( forever.format(true, [process]) );
      done();
    }
    else {
      gruntRef.file.mkdir(logDir);
      // 'forever start -o out.log -e err.log -c node -a -m 3 index.js';
      forever.startDaemon( index, {
        logFile: logFile,
        errFile: errFile,
        outFile: outFile,
        command: commandName,
        append: true,
        max: max
      });
      log( 'Logs can be found at ' + logDir + '.' );
      done();
    }
  });
}
/**
 * Attempts to stop a process previously started associated with index.
 * @param  {String} index Filename associated with previously started process.
 */
function stopOnProcess(index) {
  log( 'Attempting to stop ' + index + '...' );
  // generate delegate function to pass with proper contexts.
  var startRequest = (function(context, index) {
    return function() {
        startForeverWithIndex.call(context, index);
    };
  }(this, index));

  done = this.async();
  findProcessWithIndex( index, function(process) {
    if( typeof process !== 'undefined' ) {
      log( forever.format(true,[process]) );

      forever.stop( index )
        .on('stop', function() {
          done();
        })
        .on('error', function(message) {
          error( 'Error stopping ' + index + '. [REASON] :: ' + message );
          done(false);
        });
    }
    else {
      warn( index + ' not found in list of processes in forever.' );

      // send mail with defined transport object
      smtpTransport.sendMail(extend(mailOptions, {
        subject: 'Server down ✔',
        text: 'Just now server is restarting. But limits have been exhausted ✔',
        html: '<b>Just now server is restarting. But limits have been exhausted ✔</b>'
      }), function(error, response) {
        if (error) log(error);
        else log('Message sent: ' + response.message);
     
        if (commandFinish) {
          log( 'exec: '+ commandFinish );

          var exec = require('child_process').exec;
          exec(commandFinish, function(error, stdout, stderr) {
            if (!error) startRequest();
            done();
          });
        }
        else {
          done();
        }
      });
    }
  });
}
/**
 * Attempts to stop and restart a process previously started associated with index. If no process found as previously started, just starts a new one.
 * @param  {String} index Filename associated with previously started process.
 */
function restartOnProcess( index ) {
  log( 'Attempting to restart ' + index + '...' );

  // generate delegate function to pass with proper contexts.
  var startRequest = (function(context, index) {
    return function() {
        startForeverWithIndex.call(context, index);
    };
  }(this, index));

  done = this.async();
  findProcessWithIndex( index, function(process) {
    if(typeof process !== 'undefined') {
      log(forever.format(true,[process]));

      // send mail with defined transport object
      smtpTransport.sendMail(extend(mailOptions, {
        subject: 'Server down ✔',
        text: 'Just now server is restarting ✔',
        html: '<b>Just now server is restarting ✔</b>'
      }), function(error, response) {
        if (error) log(error);
        else log('Message sent: ' + response.message);
        forever.restart(index, false);
        done();
      });
    }
    else {
      log(index + ' not found in list of processes in forever. Starting new instance...');
      startRequest();
      done();
    }
  });
}

/**
 * grunt-future task
 * @param  {Object} grunt Grunt
 */
module.exports = function(grunt) {

  gruntRef = grunt;
  grunt.registerMultiTask( 'forever', 'Starts node app as a daemon.', function(target) {

      var index = this.options().index || 'index.js',
          operation = target || this.options().operation || 'start';

      commandName = this.options().command;

      max = this.options().max || 100;
      
      if (this.options().logDir) {
        logDir  = path.join(process.cwd(), this.options().logDir) || logDir;
        logFile = path.join(logDir, this.options().logFile || 'log.log');
        errFile = path.join(logDir, this.options().errFile || 'err.log');
        outFile = path.join(logDir, this.options().outFile || 'out.log');
      }
      
      if (this.options().mailerTransport) mailerTransport = extend(mailerTransport, this.options().mailerTransport || {});
      // create reusable transport method
      smtpTransport = nodemailer.createTransport(mailerTransport.type, {
        service: mailerTransport.service,
        auth: {
          user: mailerTransport.user,
          pass: mailerTransport.pass
        }
      });

      // setup e-mail data
      if (this.options().mailOptions) mailOptions = extend(mailOptions, this.options().mailOptions || {});

      if (this.options().commandFinish) commandFinish = this.options().commandFinish || commandFinish;

      try {
        if(commandMap.hasOwnProperty(operation)) {
          commandMap[operation].call(this, index);
        }
        else {
          warn('Operation ' + operation + ' is not supported currently. Only forever:start, forever:stop, forever:restart or forever:list.');
        }
      }
      catch(e) {
          error('Exception thrown in attempt to ' + operation + ' on ' + index + ': ' + e);
      }
  });
};
