/*
 * JSONkeeper Editor v1.0
 * https://github.com/2sc1815j/
 *
 * Copyright 2018 Jun HOMMA (@2SC1815J)
 * Released under the MIT license
 *
 * Licenses of open source libraries, see json-keeper-editor/acknowledgements.txt
 */
var jsonEditor = (function() {
    var configExample = {
        generic: {
            service: {
                curationJsonExportUrl: 'http://164.67.152.202/cp/curation/api'
            }
        },
        curation: {
            service: {
                curationJsonExportUrl: 'http://164.67.152.202/cp/curation/api'
            },
            jsonEditorOptions: {
                schema: jkeCurationSchema //see, curationSchema.js
            }
        }
    };
    return JSONkeeperEditor(configExample.curation);
})();
