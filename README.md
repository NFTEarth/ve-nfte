# NFTEarth implementation of the voting escrowed model. 

## Local Development and Testing

### Requirements

You should have Node 12 installed. Use [nvm](https://github.com/nvm-sh/nvm) to install it.

### Development

Clone this repository, install NodeJS dependencies, and build the source code:

```bash
git clone git@github.com:perpetual-protocol/perp-voting-escrow.git
npm i
npm run build
```

Since there are some runtime environment dependencies, if the installation failed on your machine, please try a vanilla install instead:

```bash
npm run clean
rm -rf node_modules/
rm package-lock.json
npm install
npm run build
```

### Testing

To run all the test cases:

```bash
npm run test
```

---

### Coverage
- Coverage simple version
```bash
npm run coverage
```

- Coverage html version
```bash
brew install lcov

npm run coverage:report

open coverage-out/index.html
```


### Snapshot

To query the latest snapshot info
```bash
npm run snapshot
```

To query specific timestamp(in sec) info (eg. `1661990400` is `2021-09-01 00:00:00` UTC)
```bash
npm run snapshot 1661990400
```
