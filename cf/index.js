/*
 * IIIF Curation Finder v1.0
 * http://codh.rois.ac.jp/software/iiif-curation-finder/
 *
 * Copyright 2018 Center for Open Data in the Humanities, Research Organization of Information and Systems
 * Released under the MIT license
 *
 * Core contributor: Jun HOMMA (@2SC1815J)
 *
 * Licenses of open source libraries, see iiif-curation-finder/acknowledgements.txt
 */
var iiifFinder = (function() {
    var configExample = {
        ezukushiBanzuke: {
            title: [
                {
                    '@language': 'ja',
                    '@value': '<span class="icf_navbar_brand_logo"></span>絵尽番付'
                },
                {
                    '@language': 'en',
                    '@value': '<span class="icf_navbar_brand_logo"></span>Ezukushi banzuke'
                }
            ],
            service: {
              /*
                curationJsonExportUrl: 'https://mp.ex.nii.ac.jp/api/curation/json',
                curationViewerUrl: 'http://codh.rois.ac.jp/software/iiif-curation-viewer/demo/',
                searchEndpointUrl: 'https://mp.ex.nii.ac.jp/api/face/search',
                facetsEndpointUrl: 'https://mp.ex.nii.ac.jp/api/face/facets'
              */
                curationJsonExportUrl: 'http://164.67.152.202/cp/curation/api',
                curationViewerUrl: 'http://164.67.152.202/cp/viewer/',
                searchEndpointUrl: 'http://164.67.152.202/cp/index/api',
                facetsEndpointUrl: 'http://164.67.152.202/cp/index/facets'
            },
            enableFacetedSearch: true
        },
    };
    return IIIFCurationFinder(configExample.ezukushiBanzuke);
})();
