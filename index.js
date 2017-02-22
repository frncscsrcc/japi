'use strict';

const Debug = require('debug');
const merge = require('deepmerge');
const Koa = require('koa');
const koaBody = require('koa-body');
const Router = require('koa-router');


let basicConfig = {
  root: '../..',
  base: '/api',
  folderACLs: "/api/ACLs",
  ACLs: {},
  controllers: []
};

module.exports = function (koaApp, apiConfig, globalObject) {

  function fatalError (error) {
    debug('fatal', error);
    throw new Error(error);
  }

  let concatMerge = function (destinationArray, sourceArray) {
    return destinationArray.concat(sourceArray);
  };

  globalObject = globalObject || {};
  let debug = Debug(globalObject.nameSpace ? globalObject.nameSpace : 'japi');
  let verbose = Debug(globalObject.nameSpace ? 'verbose:' + globalObject.nameSpace : 'verbose:japi');

  apiConfig = apiConfig || {};
  let defaultConfig = apiConfig.default || {};
  let envConfig = apiConfig[process.env.NODE_ENV || 'development'] || {};
  let config;
  config = merge(basicConfig, defaultConfig, {arrayMerge: concatMerge});
  config = merge(config, envConfig, {arrayMerge: concatMerge});

  // -------------------------------
  // Load ACLs
  // -------------------------------
  let ACLs = {};
  if (config.ACLs) {

    // 1) Single ACLs
    for (let ACL in config.ACLs) {

      if (Array.isArray(config.ACLs[ACL]))
        continue;

      // 1.a) Load module Implicit path
      if (config.ACLs[ACL] === true) {
        try {
          ACLs[ACL] = require(config.root + config.folderACLs + ACL);
        } catch (err) {
          fatalError('Middleware ' + ACL + ' not found in ' + config.root + config.folderACLs);
        }
      }
      // 1.b) Load module Explicit path
      else {
        try {
          ACLs[ACL] = require(config.root + config.ACLs[ACL]);
        } catch (err) {
          fatalError('Middleware ' + ACL + ' not found in ' + config.root + config.ACLs[ACL]);
        }
      }

      // Return generator
      try {
        ACLs[ACL] = ACLs[ACL](globalObject);
      } catch (err) {
        fatalError('Middleware ' + ACL + ' wrong format');
      }

      // Check ACL is a function
      if (typeof ACLs[ACL] !== 'function')
        fatalError('Middleware ' + ACL + ' does not return a function');

      debug('info', 'Loaded single ACL ' + ACL);

    }

    // 2) Composed ACLs (chains)
    for (let ACL in config.ACLs) {

      if (!Array.isArray(config.ACLs[ACL]))
        continue;

      for (let i = 0; i < config.ACLs[ACL].length; i++) {
        let entry = config.ACLs[ACL][i];

        // 2.a) Was previusly defined as single ACL
        if (ACLs[entry]) {
          ACLs[ACL] = ACLs[ACL] || [];
          ACLs[ACL].push(ACLs[entry]);
        }

        // 2.b) Is an explicit path (better to avoid!)
        else {
          let validACL;
          try {
            validACL = require(config.root + entry);
          } catch (err) {
            fatalError('Middleware ' + entry + ' not found in ' + config.root + entry)
          }

          validACL = validACL(globalObject);
          if (typeof validACL !== 'function')
            fatalError('Middleware ' + entry + ' does not return a function');

          ACLs[ACL] = ACLs[ACL] || [];
          ACLs[ACL].push(validACL);
        }
      }

      debug('info', 'Loaded chain  ACL ' + ACL);

    }

  }

  // -------------------------------
  // Add an empty ACL
  // -------------------------------
  ACLs.__NoACL__ = function * (next) {
    yield next;
  };

  // -------------------------------
  // Create ACL routers
  // -------------------------------

  let aclRouters = {};
  for (let ACL in ACLs) {
    aclRouters[ACL] = new Router();

    // Single ACL
    if (!Array.isArray(ACLs[ACL])) {
      // Just mount middleware
      aclRouters[ACL].use(ACLs[ACL]);
    }
    // ACL chain
    else {
      let aclArray = ACLs[ACL];
      // Apply -in the right order - all the single ACLs
      for (let a = 0; a < aclArray.length; a++) {
        aclRouters[ACL].use(aclArray[a]);
      }
    }

  }

  // -------------------------------
  // Load controllers
  // -------------------------------

  function findModule (path) {
    let module;
    try {
      module = require(path);
    } catch (err) {
      if (err.message.indexOf('Cannot find module') >= 0)
        return false;
      else
        throw new Error(err);
    }

    try {
      module = module(globalObject);
      return module;
    } catch (err) {
      return false;
    }

  }

  function pickGenerator (module, method, subPath) {

    for (let label in module) {
      let [myMethod, mySubPath] = label.split(/[\s,]+/);
      if (myMethod.toLowerCase() == method.toLowerCase() &&
          mySubPath === subPath && typeof module[label] === 'function') {
        return module[label];
      }
    }

    return false;
  }


  for (let c = 0; c < config.controllers.length; c++) {

    let parsedControlled = config.controllers[c].trim().split(/\s+/);

    let ACL, method, path;

    if (parsedControlled.length === 3) {
      ACL = parsedControlled[0];
      method = parsedControlled[1];
      path = parsedControlled[2];
    }
    else if (parsedControlled.length === 2) {
      ACL = '__NoACL__';
      method = parsedControlled[0];
      path = parsedControlled[1];
    }

    if (!ACL) {
      ACL = '__NoACL__';
    }

    let filePath;
    let subPath = "";
    let module;
    let controller;

    // Find the controller search in base, complete path ()
    filePath = config.root + config.base + path;
    while (true) {

      let label = method;
      if (subPath)
        label += ' ' + subPath;
      verbose('info', 'Searching ' + label + ' in ' + filePath);

      module = findModule(filePath);
      if (module) {
        controller = pickGenerator(module, method, subPath);
      }
      if (controller) {
        debug('info', 'Found ' + label + ' in ' + filePath);
        break;
      }

      // Remove last token
      filePath = filePath.split('/');
      subPath = '/' + filePath.pop() + subPath;
      filePath = filePath.join('/');

      // If path does not contain any more the base base, I can not find module/controller!
      if (filePath.indexOf(config.root + config.base) < 0) {
        debug('warning', 'Cannot find "' + label + '"');
        break;
      }
    }

    // Mount route on aclRouters
    if (controller) {
      aclRouters[ACL][method.toLowerCase()](path, koaBody(), (function () {
        return controller;
      }() ));
    }

  }

  // Mount ACL to main router
  const mainRouter = new Router();
  for (let ACL in ACLs) {
    if (ACL === '__NoACL__')
      mainRouter.use(aclRouters[ACL].middleware());
    else
      mainRouter.use(ACL, aclRouters[ACL].middleware());
  }

  // Mount main router to Api router
  const api = new Router();
  api.use(config.base, function *(next){
    verbose('debug', '<== ' + this.url);
    yield next;
  });

  // Intercept any error
  api.use(config.base, function *(next) {
    try{
      return yield next;
    }
    catch(error){
      debug('error', error.stack);
      this.code = 500;
      return this.body = {
        status: 'ko',
        error: process.env.NODE_ENV !== 'production' ? error.stack : error.message
      };
    }
  });

  api.use(config.base, mainRouter.routes());

  // Mount Api router to koa application
  koaApp.use(api.routes());

  // Intercept 404 (just on the base path)
  koaApp.use(function *(next){
    let regex = new RegExp('^' + config.base + '/');
    if(regex.test(this.url) && this.body === undefined){
      verbose('debug', '<== ' + this.url);
      verbose('error', this.url + ' not found');

      this.code = 404;
      this.body = {
        status: 'ko',
        error: 'Page ' + this.url + ' not found'
      }
    }
    else{
      yield next;
    }

  });


};

