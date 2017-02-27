# jAPIs

### REST API generator (based on koa framework)


by Francesco Sirocco (frncscsrcc@gmail.com)

#### Description

jAPIs helps you write clean code when you want to add one or more REST API to your KOA based application.

Briefly, jAPIs works mounting run-time the various routes and associating them with middlewares and controllers. The behavior of the library is completely based on a file configuration and, implementing simple developing patterns, it will help you to write cleaner code, without dealing the "boring and repetitive parts" (eg: creating routes, mount the routes to build complex path, handle exceptions, etc). 

#### URL path structure

jAPIs proposes a simple standards for your entrypoints: they will look like something like this: **example.com/api/v1/admin/roles/add**.

The path is composed of two or three parts:

``` 
Eg: example.com/api/v1/admin/roles/add

    /api/v1      /admin              /roles/add
    BASE PATH    ACL (optional)      CONTROLLER  
```

- *BASE PATH* (eg: **/api/v1**): it defines your specific API "id" and it allows to have several distinct and independent APIs within the same application (or different versions of the same API).

- *ACL* (eg: **/admin**): this **optional** portion of the path defines a middleware (or a chain of middlewares) that will evaluate the request request, before passing it to the controller. You could use for authentication/authorization pourposes, logging, managing sessions, etc.

- *CONTROLLER* (eg: **/roles/add**): the main controller where your magic happens!

#### Use the library

```
npm install -S japis
```

```
const Koa = require('koa');
var japis = require(japis);

const koaApp = new Koa();

// See configuration
const japisConf1 = {...};
const japisConf2 = {...};

// Here data will be acessible to middleware and controllers.
const globalObject = {...}; 

// Mounting API1
japis(koaApp, japisConf1, globalObject);

// Mounting API2
japis(koaApp, japisConf2, globalObject);

```

#### Configuration

The jAPIs behavior is fully controlled by a configuration object that you have to pass in the initialization time of the library.

This object should have the following structure:

```
var config = {
   default: { ... },
   development: { ... },
   production: { ... },
   yourAmbient: { ... }
}
```

jAPIs will read the opion reported in the default section and will overwrite with the one of your specific NODE_ENV environment variable (if not defined it will try to use "development"). With this approach you can have different entrypoints (or just different behaviors) according with the application environment.

Here we report the common structure you should define in the configuration object.

```
var config = {
	default: {
		
		// ---------------------------------------
		// GENERAL
		// ---------------------------------------
		root: __dirname, // default is '../../'
		base: '/api/v1', // default is '/api'
  		
  		// ---------------------------------------
  		// ACL
  		// ---------------------------------------
  		ACLs: {
  			// Implicit path (will be searched in default ACL folder
  			'/acl1': true,
  			
  			// Explicith path
  			'/acl2': 'myAcls/acl2',
  			
  			// ACLs chain
  			'/acl3': ['/acl2', '/acl1']
  		},
  		
  		// ---------------------------------------
  		// CONTROLLERS
  		// ---------------------------------------
  		controllers: [
  			'POST /acl1 /roles/add',
  			'DELETE /acl2 /roles/delete',
  			'PUT /acl3 /roles/update',
  			'GET /roles/delete', // No ACL involved
  		]
	}
}
```

The configuration of the structure should be pretty self explanatory, but a few clarifications:

- **root**: it should be the absolute path of the application, used to search ACLs and Controllers modules.
- **base**: it is the base of the path, all the endpoints will be mounted here. This parameter defines also the tree structure where jAPIs will try to find ACLs and Controllers (see *Controllers and folder structure*).
- **ACLs**: ACLs could be defined in several ways.
    - {'/acl_name' : true}, it will search "acl_name" module inside ACLs default folder.
    - {'/acl_name' : '/path/for/module'}: it will search "acl_name" in the /path/for/module, so require('/path/for/module').
    - {'/acl_name' : ['/ACL1', '/ACL2']}: it will define a ACL's chain that is simply a middleware chain.
- **controllers**: it defines the controller method (GET, POST, ...), the ACL to use to filter the request and the controller path (see. *Controllers and folder structure*).

#### Controllers and folder structure

