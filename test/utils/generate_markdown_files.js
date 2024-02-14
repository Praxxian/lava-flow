const fs = require('fs');

function generateFiles(numFiles, textLength = 100000) {
  for (let i = 0; i < numFiles; i++) {
    let text = '';
    for (let i = 0; i < textLength; i++) text += 'a';
    const fileName = `test\\Test Vault\\Test Volume\\volume-${i + 1}.md`;
    fs.writeFileSync(fileName, text, 'utf8');
    console.log(`Generated file: ${fileName}`);
  }
}

generateFiles(200);
