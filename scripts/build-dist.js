const {spawnSync} = require('child_process');
const path = require('path');
const fs = require('fs');

function run(cmd, args, opts = {}) {
    const res = spawnSync(cmd, args, {stdio: 'inherit', shell: true, ...opts});
    if (res.status !== 0) {
        process.exit(res.status);
    }
}

// remove dist directory (use rimraf from local node_modules if available)
const rimraf = path.join(__dirname, '..', 'node_modules', '.bin', 'rimraf');
if (fs.existsSync(rimraf)) {
    run(rimraf, ['dist']);
} else {
    // fallback: remove recursively using fs
    const dist = path.join(__dirname, '..', 'dist');
    if (fs.existsSync(dist)) {
        fs.rmSync(dist, {recursive: true, force: true});
    }
}

// run babel from local node_modules
const babel = path.join(__dirname, '..', 'node_modules', '.bin', 'babel');
if (!fs.existsSync(babel)) {
    console.error('Local babel not found. Please run `npm install`.');
    process.exit(1);
}
// Tell Babel to process TypeScript files as well
run(babel, ['src', '--out-dir', 'dist', '--extensions', '.ts,.tsx,.js,.jsx']);

// copy the index.d.ts file
const srcDts = path.join(__dirname, '..', 'src', 'index.d.ts');
const destDts = path.join(__dirname, '..', 'dist', 'index.d.ts');
fs.mkdirSync(path.dirname(destDts), {recursive: true});
fs.copyFileSync(srcDts, destDts);

console.log('Built dist/ successfully');
