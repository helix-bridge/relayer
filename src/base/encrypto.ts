import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";
import { question } from "readline-sync";

export class Encrypto {
  public passwd: string;

  async readPasswd() {
    const passwd = question("Password:", { hideEchoBack: true });
    this.passwd = createHash("sha256").update(String(passwd)).digest("base64");
  }

  public decrypt(str): string {
    let encrySplit = str.split(":");
    let iv = Buffer.from(encrySplit.shift(), "hex");
    let encrypted = Buffer.from(encrySplit.join(":"), "hex");
    var decipher = createDecipheriv(
      "aes-256-ctr",
      Buffer.from(this.passwd, "base64"),
      iv
    );
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  }

  public encrypt(str): string {
    let iv = randomBytes(16);
    var cipher = createCipheriv(
      "aes-256-ctr",
      Buffer.from(this.passwd, "base64"),
      iv
    );
    let encrypted = cipher.update(str);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString("hex") + ":" + encrypted.toString("hex");
  }
}
