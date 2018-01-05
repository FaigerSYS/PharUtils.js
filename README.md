# PharUtils.js
Utilities for working with Phar archives in JavaScipt
***

## Dependencies
 - Zlib.RawInflate, Zlib.RawDeflate (https://github.com/imaya/zlib.js)
 - Hashes (https://github.com/h2non/jshashes/)

## Soft dependencies
 - Zlib.Zip, Zlib.Unzip (https://github.com/imaya/zlib.js)
***

## Usage
 - Loading Phar archive from contents
``` js
// Phar contents as <string> or <Uint8Array>
var phar = new PharUtils.Phar();
phar.loadPharData(phar_contents);
```
 - Creating new Phar archive
``` js
var phar = new PharUtils.Phar();
phar.setStub('<?php echo "Works!" . PHP_EOL; __HALT_COMPILER();');
phar.setSignatureType(PharUtils.SIGNATURE_SHA256);
```
 - Adding file to Phar archive
``` js
// Phar object
var new_file = new PharUtils.PharFile("myName.txt", "some_contents");
phar.addFile(new_file);
```
 - Saving Phar archive to contents
``` js
// Phar object
var phar_contents = phar.savePharData();
```
 - Converting to Zip
``` js
// Phar object
var zip = PharUtils.PharZipConverter.toZip(phar);
```
...and more! Just look at the source.
***

## License
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
