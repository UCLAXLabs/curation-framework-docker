/*
 * IIIF Curation Finder - JSONkeeper export plugin
 * http://codh.rois.ac.jp/software/iiif-curation-finder/
 *
 * Copyright 2018 Center for Open Data in the Humanities, Research Organization of Information and Systems
 * Released under the MIT license
 *
 * Core contributor: Jun HOMMA (@2SC1815J)
 */
var icfExportJsonKeeper = (function() {
    var jsonKeeperConfig = {
        accessControl: 'firebase',
        allowAnonymousPost: true,
        redirectUrl: 'http://164.67.152.202/cp/viewer/'
    };
    return ICFExportJsonKeeper(jsonKeeperConfig);
})();
