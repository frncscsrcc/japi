const Debug = require('debug');
const fs = require('fs');

var module = module.exports = function (apiConfigFile, globalObject) {

  globalObject = globalObject || {}
	let debug = Debug(globalObject.nameSpace ? globalObject.nameSpace : 'japi');
  let verbose = Debug(globalObject.nameSpace ? 'verbose:' + globalObject.nameSpace : 'verbose:japi');

  function falatError(error){
    debug('fatal', error);
    throw new Error(error);
  }
  
  function apiValidator(apiConfig){
    if(!apiConfig.root)
      falatError('Missing root');
    if(!apiConfig.base)
      falatError('Missing base');
  };

  
  // -------------------------------
  // Read config file
  // -------------------------------
  let config;
  try{
    config = require(apiConfigFile);
  }catch(err){
    falatError('Not possible to read/parse config file.');
  }

  // -------------------------------
  // Validate config file
  // -------------------------------
  apiValidator(config);

  // -------------------------------
  // Load middlewares
  // -------------------------------
  let middlewares = {};
  if(config.middlewares){

    // 1) Single middlewares
    for(middleware in config.middlewares){

      if(Array.isArray(config.middlewares[middleware]))
        continue;

      // 1.a) Load module Implicit path
      if(config.middlewares[middleware] === true){
        try{
          middlewares[middleware] = require(config.root + '/middlewares/' + middleware);
        }catch(err){
          falatError('Middleware ' + middleware + ' not found (implicit path)');
        }
      }
      // 1.b) Load module Explicit path
      else{
        try{
          middlewares[middleware] = require(config.root + config.middlewares[middleware]);
        }catch(err){
          falatError('Middleware ' + middleware + ' not found (explicit path)');
        }
      }

      // Return generator
      try{
        middlewares[middleware] = middlewares[middleware](globalObject);
      }catch(err){
        falatError('Middleware ' + middleware + ' wrong format');
      }

      // Check middleware is a function
      if(typeof middlewares[middleware] !== 'function')
        falatError('Middleware ' + middleware + ' does not return a function');

      debug('info', 'Loaded single middleware ' + middleware);

    }

    // 2) Composed middlewares (chains)
    for(middleware in config.middlewares){
      
      if(!Array.isArray(config.middlewares[middleware]))
        continue;

      for(let i = 0; i < config.middlewares[middleware].length; i++){
        let entry = config.middlewares[middleware][i];

        // 2.a) Was previusly defined as single middleware
        if(middlewares[entry]){
          middlewares[middleware] = middlewares[middleware] || [];
          middlewares[middleware].push(middlewares[entry]);
        }

        // 2.b) Is an explicit path (better to avoid!)
        else{
          let validMiddleware;
          try{
            validMiddleware = require(config.root + entry);
          }catch(err){
            falatError('Middleware ' + entry + ' not found (explicit path)')
          }

          validMiddleware = validMiddleware(globalObject);
          if(typeof validMiddleware !== 'function')
            falatError('Middleware ' + entry + ' does not return a function');

          middlewares[middleware] = middlewares[middleware] || [];
          middlewares[middleware].push(validMiddleware);
        }
      }

      debug('info', 'Loaded chain  middleware ' + middleware);

    }

  }

  // -------------------------------
  // Load paths
  // -------------------------------

  let moduleCache = {};

  function findModule(path){
    let module;
    if(moduleCache[path])
      return moduleCache[path];
    try{
      module = require(path);
    }catch(err){
      if(err.message.indexOf('Cannot find module') >= 0)
        return false;
      else
        throw new Error(err);
    }
    
    try{
      module = module(globalObject);
      //console.log("Found module for " + path)
      return module;
    }catch(err){
      return false;
    }

  }

  function extractRoute(module, method, subPath){
    let label = method;
    if(subPath)
      label += ':' + subPath;
    if(module[label] && typeof module[label] === 'function'){
      //console.log('Found method ' + label);
      return module[label];
    }
    return false;
  }


  for(let p = 0; p < config.paths.length; p++){
    let [middleware, path, method] = config.paths[p];
    
    let module;
    let subPath = "";
    let route;
    let filePath;
    let ok = false;
    // base: "/api/v1", path "/add/one"

    // 1) Search in base, complete path ()
    filePath = config.root + config.base + path;
    while(true){
      
      let label = method;
      if(subPath)
        label += ':' + subPath;
      verbose('info', 'Searching ' + label + ' in ' + filePath);

      //console.log('Search ' + filePath)
      module = findModule(filePath);
      if(module){
        //console.log('Search route' + filePath + " " + method + ":" + subPath);
        route = extractRoute(module, method, subPath);
      }
      if(route){
        ok = true;
        debug('info', 'Found ** ' + label + ' ** in ' + filePath);
        break;
      }

      // Remove last token
      filePath = filePath.split('/');
      subPath = '/' + filePath.pop() + subPath;
      filePath = filePath.join('/');

      // If path does not contain any more base, I can not find module/route!
      if(filePath.indexOf(config.root + config.base) < 0){
        ok = false;
        break;
      }
    }


  }


}


module('./api.json', {});