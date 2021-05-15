# cscan
A CLI tool to get info about a repositories commits.

### Usage
```
Usage: cscan [options] [path]

Options:
  -v, --verbose    Displays results with more detail then the usual scan	[boolean] [default: false]
  -c, --concise    Displays a concise readout of scan results       			[boolean] [default: false]
  -t, --threshold  Commit message character threshold     					      [number] [default: 10]
      --csv        Saves commit history as a .csv file						        [boolean] [default: false]
      --out        Specify output location of .csv file 					        [string] [default: "./commits.csv"]
  -h, --help       Show help                                           		[boolean]
```

## Development
I wrote this program in TypeScript so I could recycle some of my other TS code. It was developed using node 14.15.1 but other recent versions will probably work too. 

### Tools
* [Nodejs with npm](https://nodejs.org)
* [pnpm](https://pnpm.io/)

### Building
To create a binary executable for whatever system you are on, run the following commands. The compiled executable will be put in the `bin` directory.
```sh
pnpm i
pnpm make
```

### Developing
Since this is TS and doesn't need to be compiled into a binary, its annoying to compile one every time you make a change. To reduce the wait time between writing code and running it, I made the `dev` script to transpile the TS to JS on every file change. You can run `pnpm dev` to start this script and then `npm start` or `node .` to run the transpiled JS.
