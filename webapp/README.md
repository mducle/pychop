# PyChop Webapp

The PyChop webapp is a single-page application running directly in the browser.
You can edit the javascript and html code directly to change the app behaviour,
but as a convenience it is nicer to use [browser-sync](https://browsersync.io/)
to automatically reload when any of the code changes.

Create a file `package.json` in this folder with this content:

```javascript
{
  "scripts": {
    "start": "browser-sync start --server . --files . --single"
  },
}
```

and run

```shell
npm start
```

(You need to install [node.js](https://nodejs.org/en)).

We use [preact.js](https://preactjs.com/)+[htm](https://github.com/developit/htm) to define the UI,
[pyodide](https://pyodide.org) to run the Python code to do the actual calculations and
[plotly](https://plotly.com/javascript/) for the graphs.
These dependencies are downloaded from content delivery networks, which takes a few seconds depending
on your connection speed and which are then cached.
You can also download the `.js` files imported in `pychop.js` directly for faster processing.
