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
  // Load ACLs
  // -------------------------------
  let ACLs = {};
  if(config.ACLs){

    // 1) Single ACLs
    for(ACL in config.ACLs){

      if(Array.isArray(config.ACLs[ACL]))
        continue;

      // 1.a) Load module Implicit path
      if(config.ACLs[ACL] === true){
        try{
          ACLs[ACL] = require(config.root + '/ACLs/' + ACL);
        }catch(err){
          falatError('Middleware ' + ACL + ' not found (implicit path)');
        }
      }
      // 1.b) Load module Explicit path
      else{
        try{
          ACLs[ACL] = require(config.root + config.ACLs[ACL]);
        }catch(err){
          falatError('Middleware ' + ACL + ' not found (explicit path)');
        }
      }

      // Return generator
      try{
        ACLs[ACL] = ACLs[ACL](globalObject);
      }catch(err){
        falatError('Middleware ' + ACL + ' wrong format');
      }

      // Check ACL is a function
      if(typeof ACLs[ACL] !== 'function')
        falatError('Middleware ' + ACL + ' does not return a function');

      debug('info', 'Loaded single ACL ' + ACL);

    }

    // 2) Composed ACLs (chains)
    for(ACL in config.ACLs){
      
      if(!Array.isArray(config.ACLs[ACL]))
        continue;

      for(let i = 0; i < config.ACLs[ACL].length; i++){
        let entry = config.ACLs[ACL][i];

        // 2.a) Was previusly defined as single ACL
        if(ACLs[entry]){
          ACLs[ACL] = ACLs[ACL] || [];
          ACLs[ACL].push(ACLs[entry]);
        }

        // 2.b) Is an explicit path (better to avoid!)
        else{
          let validACL;
          try{
            validACL = require(config.root + entry);
          }catch(err){
            falatError('Middleware ' + entry + ' not found (explicit path)')
          }

          validACL = validACL(globalObject);
          if(typeof validACL !== 'function')
            falatError('Middleware ' + entry + ' does not return a function');

          ACLs[ACL] = ACLs[ACL] || [];
          ACLs[ACL].push(validACL);
        }
      }

      debug('info', 'Loaded chain  ACL ' + ACL);

    }

  }

  // -------------------------------
  // Load paths
  // -------------------------------

  let moduleCache = {};

  function findModule(path){
    let module;
    if(moduleCache[path])
      return moduleCache[path](globalObject);
    try{
      module = require(path);
      moduleCache[path] = module;
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
    let [method, middleware, path] = config.paths[p];
    
    let filePath;
    let subPath = "";
    let module;
    let route;
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
        debug('info', 'Found "' + label + '" in ' + filePath);
        break;
      }

      // Remove last token
      filePath = filePath.split('/');
      subPath = '/' + filePath.pop() + subPath;
      filePath = filePath.join('/');

      // If path does not contain any more the base base, I can not find module/route!
      if(filePath.indexOf(config.root + config.base) < 0){
        debug('warning', 'Cannot find "' + label + '"');
        break;
      }
    }

    

  }


}


module('./api.json', {});