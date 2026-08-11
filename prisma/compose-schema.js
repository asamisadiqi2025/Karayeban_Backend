const fs = require('fs');
const path = require('path');

const prismaDir = path.join(__dirname);
const baseFile = path.join(prismaDir, 'base.prisma');
const modelsDir = path.join(prismaDir, 'models');
const outFile = path.join(prismaDir, 'schema.prisma');

function compose() {
  const base = fs.readFileSync(baseFile, 'utf-8');

  const modelFiles = fs.readdirSync(modelsDir)
    .filter(f => f.endsWith('.prisma'))
    .sort();

  const models = modelFiles.map(f => fs.readFileSync(path.join(modelsDir, f), 'utf-8')).join('\n\n');

  const composed = base.trim() + '\n\n' + models.trim() + '\n';

  fs.writeFileSync(outFile, composed, 'utf-8');
  console.log('Wrote', outFile);
}

compose();
