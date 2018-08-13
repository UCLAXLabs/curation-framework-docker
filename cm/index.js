/*
 * IIIF Curation Manager v1.0
 *
 * Copyright 2018 Jun HOMMA (@2SC1815J)
 *
 * Licenses of open source libraries, see iiif-curation-manager/acknowledgements.txt
 */
var iiifManager = (function() {
    var configExample = {
        generic: {
            service: {
                /*
                curationJsonExportUrl: 'https://mp.ex.nii.ac.jp/api/curation/json',
                curationViewerUrl: 'http://codh.rois.ac.jp/software/iiif-curation-viewer/demo/',
                jsonKeeperEditorUrl: 'http://www.flxstyle.com/iiif/jke/'
                */
                curationJsonExportUrl: 'http://164.67.152.202/cp/curation/api',
                curationViewerUrl: 'http://164.67.152.202/cp/viewer/',
                jsonKeeperEditorUrl: 'http://www.flxstyle.com/iiif/jke/'
            }
        }
    };
    return IIIFCurationManager(configExample.generic);
})();
