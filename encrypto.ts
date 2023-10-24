import { question } from 'readline-sync';
import { Encrypto } from './src/base/encrypto';

const encrypto = new Encrypto();

const passwd = encrypto.readPasswd();
const privateKey = question("PrivateKey:", {hideEchoBack: true});

const encryptedKey = encrypto.encrypt(privateKey);
console.log(encryptedKey);
