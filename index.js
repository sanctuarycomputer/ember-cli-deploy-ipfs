/* eslint-env node */
'use strict';
var BasePlugin = require('ember-cli-deploy-plugin');
var IPFS = require('ipfs');
var minimatch = require('minimatch');
var RSVP = require('rsvp');
var fs = require('fs');
var fetch = require('node-fetch');

function pinRootOnNode(files, config) {
  let root = files.find(file => file.path === '.');
  return fetch(config.nodeHost + '/api/v0/pin/add?arg=' + root.hash + '&recursive=true', {
    headers: { Authorization: 'Basic ' + config.authSecret }
  });
};

module.exports = {
  name: 'ember-cli-deploy-ipfs',

  createDeployPlugin: function(options) {
    var DeployPlugin = BasePlugin.extend({
      name: options.name,

      defaultConfig: {
        filePattern: '**/*.{html,js,css,png,gif,ico,jpg,map,xml,txt,svg,swf,eot,ttf,woff,woff2,otf}',
        dotFolders: false,
        distDir: function(context) { return context.distDir; },
        distFiles: function(context) { return context.distFiles || []; }
      },

      didBuild: function(context) {
        if (!context.distDir || !context.distFiles) {
          this.log('There are no files present to deploy, have you run `ember install ember-cli-deploy-build` ?');
        }
      },

      upload: function(context) {
        var self = this;

        var filePattern = this.readConfig('filePattern');
        var distDir     = this.readConfig('distDir');
        var distFiles   = this.readConfig('distFiles');
        var dotFolders  = this.readConfig('dotFolders');

        var filesToUpload = distFiles
                            .filter(minimatch.filter(filePattern, { matchBase: true, dot: dotFolders }))
                            .map(function(filepath) {
                              return {
                                path: './'+filepath,
                                content: fs.createReadStream(distDir + '/' + filepath)
                              };
                            });


        let node;
        return new RSVP.Promise(function(resolve, reject) {
          node = new IPFS();
          node.on('ready', () => {
            node.files.add(filesToUpload)
              .then(files => pinRootOnNode(files, context.config.ipfs))
              .then(res => {
                if (res.status === 200) return res.json();
                self.log('An error occured pinning your app on your IPFS node.')
                return res.text().then(parsed => { throw parsed; });
              })
              .then(res => {
                Object.keys(res).forEach(key => self.log(res[key]))
              })
              .then(resolve)
              .catch(reject)
          });
        }).then(function(files) {
          context.ipfsFileHashes = files;
          self.log('Now run ipfs name publish '+root.hash);
        }).finally(() => {
          if (!!node) {
            try {
              node.stop();
            } catch (e) {
              self.log('Could not stop IPFS node successfully.');
              self.log(e);
            }
          }
        });
      },

      didUpload: function(context) {
        // https://github.com/ipfs/js-ipfs/issues/209
        //console.log(context.project.root)
        //let root = context.ipfsFileHashes.find(function(file) { return file.path === '.'; });
        //this.log('Success! Now run ipfs name publish '+root.hash);
      },

      didDeploy: function(context) {
        //do something here like notify your team on slack
      }
    });
    return new DeployPlugin();
  }
};
