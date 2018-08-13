/*
 * IIIF Curation Finder v1.0
 * http://codh.rois.ac.jp/software/iiif-curation-finder/
 *
 * Copyright 2018 Center for Open Data in the Humanities, Research Organization of Information and Systems
 * Released under the MIT license
 *
 * Core contributor: Jun HOMMA (@2SC1815J)
 *
 * Licenses of open source libraries, see acknowledgements.txt
 */
var IIIFCurationFinder = function(config) {
    'use strict';

    //var version = '1.0.0';

    var map; //Leaflet

    var bookInfos = [];
    var pageInfos = [];
    var curationInfo = {};

    var canvasQueryResults = []; //検索結果（キャンバスのリスト）

    var isTimelineMode = false;

    var page = 0; //0-based
    var mode;

    //リテラルはさほど多くないので、i18n用のフレームワークは用いず、直接記述する。
    var lng = 'ja';

    var err;

    var storage;
    try {
        storage = localStorage;
    } catch (e) {
        //
    }

    var CONTEXT_CURATION = 'http://codh.rois.ac.jp/iiif/curation/1/context.json';
    var CONTEXT_TIMELINE = 'http://codh.rois.ac.jp/iiif/timeline/1/context.json';
    var CONTEXT_CURSOR   = 'http://codh.rois.ac.jp/iiif/cursor/1/context.json';

    var defaultConfig = {
        title: 'IIIF Curation Finder',
        //表示を認めるmanifest/timelineのURL設定
        trustedUrlPrefixes: ['https://', 'http://'], //正規表現不可、前方一致 eg ['https://', 'http://']
        service: {
            curationJsonExportUrl: '',  //関連： exportCurationJson()
            curationViewerUrl: 'http://164.67.152.202/cp/viewer/'
        },
        enableFacetedSearch: false
    };
    var conf = configure(config, defaultConfig);

    var params = getParams(location.search);
    if (params) {
        if ('lang' in params) { //表示言語指定
            if (params.lang !== 'ja') {
                lng = 'en'; //ja以外は全てenにfallback
            }
        }
    }

    setupUi();

    if (params) {
        if ('where' in params || ('where_metadata_label' in params && 'where_metadata_value' in params)) {
            //検索
            var searchWord;
            if ('where' in params) {
                //通常検索
                searchWord = params.where;
                $('#search_word').val(searchWord);
                if ('where_agent' in params) {
                    var agentParams = String(params.where_agent).split(',');
                    $('#where_agent_human').prop('checked', ($.inArray('human', agentParams) > -1));
                    $('#where_agent_machine').prop('checked', ($.inArray('machine', agentParams) > -1));
                }
            } else if ('where_metadata_label' in params && 'where_metadata_value' in params) {
                //ファセット検索
                searchWord = {label: params.where_metadata_label, value: params.where_metadata_value};
                if (conf.enableFacetedSearch) {
                    var facetLabel = getPropertyValueI18n(searchWord.label);
                    var facetValue = getPropertyValueI18n(searchWord.value);
                    var label = facetLabel + '：' + facetValue;
                    var labelSpan = $('<span>').text(label).prop('outerHTML');
                    var $link = $('<span>').addClass('facet_tag_generic').html('<span class="glyphicon glyphicon-tag"></span> ' + labelSpan);
                    $('#searched_facet').replaceWith($link);
                }
            }
            var queryOptions = {
                select: params.select,
                from: params.from,
                limit: params.limit,
                start: params.start,
                agent: params.where_agent
            };
            var mode_ = (params.select === 'canvas') ? 'canvasSearch' : 'curationSearch';
            switchMode(mode_);
            processQuery(searchWord, queryOptions);
        } else if (params.curation) {
            //curation.jsonのURLによる表示対象指定
            switchMode('curationSearch'); //キュレーションタブで表示
            processCurationUrl(params.curation);
        } else {
            switchMode();
            processFacetsList(); //ファセット一覧の表示
        }
    } else {
        switchMode();
        processFacetsList(); //ファセット一覧の表示
    }

    //----------------------------------------------------------------------
    function configure(config, defaultConfig) {
        var conf_ = defaultConfig;
        var i;
        if ($.isPlainObject(config)) {
            if ($.type(config.title) === 'string' || $.type(config.title) === 'array') {
                conf_.title = config.title;
            }
            if ($.isArray(config.trustedUrlPrefixes)) {
                var trustedUrlPrefixes = [];
                for (i = 0; i < config.trustedUrlPrefixes.length; i++) {
                    var trustedUrlPrefix = config.trustedUrlPrefixes[i];
                    if (trustedUrlPrefix && $.type(trustedUrlPrefix) === 'string') {
                        var anchor = document.createElement('a');
                        anchor.href = trustedUrlPrefix;
                        var href = anchor.href;
                        if (href) {
                            href = href.replace(/:\/\/\/$/, '://'); //workaround for Firefox ESR 52 incompatibility
                            trustedUrlPrefixes.push(href);
                        }
                    }
                }
                conf_.trustedUrlPrefixes = trustedUrlPrefixes;
            }
            if ($.isPlainObject(config.service)) {
                if ($.type(config.service.curationJsonExportUrl) === 'string') {
                    conf_.service.curationJsonExportUrl = config.service.curationJsonExportUrl;
                }
                if ($.type(config.service.curationViewerUrl) === 'string') {
                    conf_.service.curationViewerUrl = config.service.curationViewerUrl;
                }
                if ($.type(config.service.searchEndpointUrl) === 'string') {
                    conf_.service.searchEndpointUrl = config.service.searchEndpointUrl;
                }
                if ($.type(config.service.facetsEndpointUrl) === 'string') {
                    conf_.service.facetsEndpointUrl = config.service.facetsEndpointUrl;
                }
            }
            if ($.type(config.enableFacetedSearch) === 'boolean') {
                conf_.enableFacetedSearch = config.enableFacetedSearch;
            }
        }
        conf_.service.curationJsonExport = conf_.service.curationJsonExportUrl;
        return conf_;
    }

    function getParams(search) {
        var query = search.substring(1);
        if (query !== '') {
            var params = query.split('&');
            var paramsObj = {};
            for (var i = 0; i < params.length; i++) {
                var elems = params[i].split('=');
                if (elems.length > 1) {
                    var key = decodeURIComponent(elems[0]);
                    var val = decodeURIComponent(elems[1]);
                    if (paramsObj[key]) {
                        paramsObj[key] = paramsObj[key] + ',' + val;
                    } else {
                        paramsObj[key] = val;
                    }
                }
            }
            return paramsObj;
        } else {
            return null;
        }
    }

    //----------------------------------------------------------------------
    //---------- curation関係 ----------
    //curationパラメータで指定されたcurationの取得 → preprocessManifestsまたはpreprocessTimelinesで内容処理
    function processCurationUrl(curationUrl) {
        $.getJSON(curationUrl, function(curation_) {
            if (isValidCurationFalseTrue(curation_)) {
                //selectionsプロパティ
                var bookParams = [];
                var timelineParams = [];
                for (var i = 0; i < curation_.selections.length; i++) {
                    var range = curation_.selections[i];
                    // http://iiif.io/api/presentation/2.1/#range
                    if ($.isPlainObject(range) && range['@type'] === 'sc:Range') {
                        if (range.within) { //withinプロパティ
                            var manifestUrl = '';
                            var timelineUrl = '';
                            var within = range.within;
                            if ($.type(within) === 'string') {
                                manifestUrl = within;
                            } else if ($.isPlainObject(within) && within['@id'] && within['@type'] && $.type(within['@id']) === 'string') {
                                if (within['@type'] === 'sc:Manifest') {
                                    manifestUrl = within['@id'];
                                } else if (within['@type'] === 'tl:Manifest' || within['@type'] === 'codh:Manifest') {
                                    timelineUrl = within['@id'];
                                }
                            }
                            if (manifestUrl && isTrustedUrl(manifestUrl)) {
                                var canvasIds = [];
                                if ($.isArray(range.canvases)) { //Rangeのcanvasesプロパティによる表示対象指定
                                    canvasIds = range.canvases; //canvasの@idの配列
                                } else if ($.isArray(range.members)) { //membersプロパティによる表示対象指定
                                    //membersプロパティ内では、sc:Canvasのみ対応。membersプロパティ内のsc:Rangeは未対応。
                                    for (var j = 0; j < range.members.length; j++) {
                                        var member = range.members[j];
                                        if ($.isPlainObject(member) && member['@id'] && member['@type']) {
                                            if (member['@type'] === 'sc:Canvas') {
                                                canvasIds.push(member['@id']);
                                            }
                                        }
                                    }
                                }
                                if (canvasIds.length > 0) {
                                    var bookParam = {
                                        manifestUrl : manifestUrl,
                                        canvasIds   : canvasIds,
                                        isFiltered  : true //結果的に元資料と同じ順番で全ページ表示されることになったとしても、ページ絞り込みありとして扱う。
                                    };
                                    bookParams.push(bookParam);
                                }
                            } else if (timelineUrl && isTrustedUrl(timelineUrl)) {
                                var canvasIds_ = [];
                                var canvasIndices = [];
                                if ($.isArray(range.members)) { //membersプロパティによる表示対象指定のみ有効
                                    //membersプロパティ内では、sc:Canvasのみ対応。membersプロパティ内のsc:Rangeは未対応。
                                    for (var k = 0; k < range.members.length; k++) {
                                        var member_ = range.members[k];
                                        if ($.isPlainObject(member_) && member_['@id'] && member_['@type']) {
                                            var cursorIndex = getCursorIndexFromCanvas(member_);
                                            if (cursorIndex !== null) {
                                                canvasIds_.push(member_['@id']);
                                                canvasIndices.push(cursorIndex);
                                            }
                                        }
                                    }
                                }
                                if (canvasIds_.length > 0) {
                                    var timelineParam = {
                                        manifestUrl   : timelineUrl,
                                        canvasIds     : canvasIds_,
                                        canvasIndices : canvasIndices,
                                        isFiltered    : true
                                    };
                                    timelineParams.push(timelineParam);
                                }
                            }
                        }
                    }
                }
                //timelineと非timelineの混在指定は未対応
                if (bookParams.length > 0) {
                    curationInfo = {
                        curation: curation_,
                        curationUrl: curationUrl
                    };
                    preprocessManifests(bookParams);
                } else if (timelineParams.length > 0) {
                    curationInfo = {
                        curation: curation_,
                        curationUrl: curationUrl
                    };
                    preprocessTimelines(timelineParams);
                } else {
                    err = new Error(); showError(1, err.lineNumber); //selectionsプロパティ記載異常
                }
            } else {
                err = new Error(); showError(1, err.lineNumber); //json異常（invalidもしくは対応外の内容）
            }
        }).fail(function(jqxhr, textStatus, error) {
            err = new Error(); showError(1, err.lineNumber, textStatus + ', ' + error); //jsonの取得に失敗
        });
    }

    //---------- timeline関係 ----------
    //curation.json内で指定されたtimeline(s)の取得 → processTimelinesで内容処理
    function preprocessTimelines(timelineParams) {
        var i;
        var timelineParamsAggregated = []; //timelineParamsをtimelineUrlによって集計したもの
        {
            var timelineUrls = [];
            var timelineCanvasIds = []; //配列の配列になる
            var timelineCanvasIndices = []; //配列の配列になる
            for (i = 0; i < timelineParams.length; i++) {
                var idx = $.inArray(timelineParams[i].manifestUrl, timelineUrls);
                if (idx === -1) {
                    timelineUrls.push(timelineParams[i].manifestUrl);
                    timelineCanvasIds.push(timelineParams[i].canvasIds);
                    timelineCanvasIndices.push(timelineParams[i].canvasIndices);
                } else {
                    $.merge(timelineCanvasIds[idx], timelineParams[i].canvasIds);
                    $.merge(timelineCanvasIndices[idx], timelineParams[i].canvasIndices);
                }
            }
            for (i = 0; i < timelineUrls.length; i++) {
                var timelineParam = {
                    manifestUrl   : timelineUrls[i],
                    canvasIds     : timelineCanvasIds[i],
                    canvasIndices : timelineCanvasIndices[i],
                    isFiltered    : true
                };
                timelineParamsAggregated.push(timelineParam);
            }
        }
        var deferreds = [];
        for (i = 0; i < timelineParamsAggregated.length; i++) {
            deferreds.push($.getJSON(timelineParamsAggregated[i].manifestUrl));
        }
        $.when.apply($, deferreds).done(function() {
            //全てのtimeline.json取得に成功してから
            var timelines = [];
            if (deferreds.length === 1 && arguments[1] === 'success') {
                timelines.push(arguments[0]);
            } else {
                for (i = 0; i < deferreds.length; i++) {
                    if (arguments[i][1] === 'success') {
                        timelines.push(arguments[i][0]);
                    }
                }
            }
            if (deferreds.length === timelines.length) {
                processTimelines(timelines, timelineParamsAggregated, timelineParams);
            } else {
                err = new Error(); showError(1, err.lineNumber);
            }
        }).fail(function(jqxhr, textStatus, error) {
            err = new Error(); showError(1, err.lineNumber, textStatus + ', ' + error); //timeline.jsonの取得に失敗
        });
    }

    //timeline(s)の内容に基づいてcursor(s)を取得 → processCursorsで内容処理
    function processTimelines(timelines, timelineParamsAggregated, timelineParams) {
        var i, j;
        var deferreds = [];
        var timelineParamsExt = [];
        for (i = 0; i < timelines.length; i++) {
            var timeline = timelines[i];
            if (isValidTimelineFalseTrue(timeline)) {
                var cursor = timeline.cursors[0];
                var cursorEndpointUrl = getCursorEndpointUrlFromCursor(cursor);
                if (!cursorEndpointUrl) {
                    continue;
                }

                var timelineUrl = timelineParamsAggregated[i].manifestUrl;
                var canvasIds = timelineParamsAggregated[i].canvasIds;
                var canvasIndices = timelineParamsAggregated[i].canvasIndices;

                //キュレーションにより、同一のコマ（fragment付きを含む）が複数挙げられている場合、
                //同一のcursorIndexに対してCursorを複数回取得するのは非効率なので、cursorIndexで束ねる。
                //あるcursorIndexで取得したCursorの中から、どのCanvasIdのものを探せば良いか分かるように、
                //cursorIndexとCanvasIdの対応関係をリストアップしておく
                var cursorIndexToCanvasIdsMap = [];
                for (j = 0; j < canvasIds.length; j++) {
                    var canvasId = canvasIds[j];
                    var cursorIndex = canvasIndices[j];
                    if (cursorIndexToCanvasIdsMap[cursorIndex]) {
                        if ($.inArray(cursorIndexToCanvasIdsMap[cursorIndex], canvasId) === -1) {
                            cursorIndexToCanvasIdsMap[cursorIndex].push(canvasId);
                        }
                    } else {
                        cursorIndexToCanvasIdsMap[cursorIndex] = [canvasId];
                    }
                }

                var cursorFirst = getCursorIndexFromProp(cursor.first);
                var cursorLast = getCursorIndexFromProp(cursor.last);
                var validCursorIndices = []; //配列
                var validCursorIndexCanvasIds = []; //配列の配列
                for (j = 0; j < canvasIndices.length; j++) {
                    var cursorIndex_ = canvasIndices[j];
                    var isInvalidCursorIndex = false;
                    if (cursorFirst !== null && cursorIndex_ < cursorFirst) {
                        isInvalidCursorIndex = true;
                    }
                    if (cursorLast !== null && cursorIndex_ > cursorLast) {
                        isInvalidCursorIndex = true;
                    }
                    if (!isInvalidCursorIndex) {
                        if ($.inArray(cursorIndex_, validCursorIndices) === -1) { //重複を除去
                            if (getCursorUrl(cursorEndpointUrl, cursorIndex_)) {
                                validCursorIndices.push(cursorIndex_);
                                validCursorIndexCanvasIds.push(cursorIndexToCanvasIdsMap[cursorIndex_]);
                            }
                        }
                    }
                }

                for (j = 0; j < validCursorIndices.length; j++) {
                    var cursorUrl = getCursorUrl(cursorEndpointUrl, validCursorIndices[j]);
                    if (cursorUrl) {
                        deferreds.push($.getJSON(cursorUrl));
                    }
                }

                var timelineParamExt = {
                    timeline      : timeline,
                    timelineUrl   : timelineUrl,
                    cursorIndexCanvasIds : validCursorIndexCanvasIds //配列の配列
                };
                timelineParamsExt.push(timelineParamExt);

            } else {
                //err = new Error(); showError(1, err.lineNumber); //json異常（invalidもしくは対応外の内容）
            }
        }
        $.when.apply($, deferreds).done(function() {
            //全てのcursor取得に成功してから
            var cursors = [];
            if (deferreds.length === 1 && arguments[1] === 'success') {
                cursors.push(arguments[0]);
            } else {
                for (i = 0; i < deferreds.length; i++) {
                    if (arguments[i][1] === 'success') {
                        cursors.push(arguments[i][0]);
                    }
                }
            }
            if (deferreds.length === cursors.length) {
                processCursors(cursors, timelineParamsExt, timelineParams);
            } else {
                err = new Error(); showError(1, err.lineNumber);
            }
        }).fail(function(jqxhr, textStatus, error) {
            err = new Error(); showError(1, err.lineNumber, textStatus + ', ' + error); //cursorの取得に失敗
        });
    }

    //timeline(s)とcursors(s)の内容をマージ → processManifestsで内容処理
    function processCursors(cursors, timelineParamsExt, timelineParams) {
        var argc = 0;
        var timelines = [];
        var timelineUrls = [];
        for (var i = 0; i < timelineParamsExt.length; i++) {
            var timeline = timelineParamsExt[i].timeline;
            var cursorIndexCanvasIds = timelineParamsExt[i].cursorIndexCanvasIds; //配列の配列
            var canvases = []; //Canvasオブジェクトの配列
            for (var j = 0; j < cursorIndexCanvasIds.length; j++) {
                var cursor = cursors[argc++];
                if (isValidCursorFalseTrue(cursor)) {
                    var canvasIds = cursorIndexCanvasIds[j]; //このCursorの中で探すべきCanvasIdの配列
                    for (var k = 0; k < canvasIds.length; k++) {
                        var canvasId = canvasIds[k].split('#')[0];
                        for (var m = 0; m < cursor.sequence.canvases.length; m++) {
                            var canvas = cursor.sequence.canvases[m];
                            if (canvas && canvas['@id'] === canvasId) {
                                canvases.push(canvas);
                                break;
                            }
                        }
                    }
                }
            }
            $.unique(canvases);
            if ($.isArray(timeline.sequences)) {
                timeline.sequences[0].canvases = canvases;
            } else {
                timeline.sequences = [
                    {
                        '@type': 'sc:Sequence',
                        'canvases': canvases
                    }
                ];
            }
            timelines.push(timeline);
            timelineUrls.push(timelineParamsExt[i].timelineUrl);
        }
        isTimelineMode = true;
        processManifests(timelines, timelineUrls, timelineParams);
    }

    //---------- manifest関係 ----------
    //pagesパラメータまたはcuration.json内で指定されたmanifest(s)の取得 → processManifestsで内容処理
    function preprocessManifests(bookParams) {
        var i;
        var manifestUrls = [];
        for (i = 0; i < bookParams.length; i++) {
            if ($.inArray(bookParams[i].manifestUrl, manifestUrls) === -1) {
                manifestUrls.push(bookParams[i].manifestUrl);
            }
        }
        var deferreds = [];
        for (i = 0; i < manifestUrls.length; i++) {
            deferreds.push($.getJSON(manifestUrls[i]));
        }
        $.when.apply($, deferreds).done(function() {
            //全てのmanifest.json取得に成功してから
            var menifests = [];
            if (deferreds.length === 1 && arguments[1] === 'success') {
                menifests.push(arguments[0]);
            } else {
                for (i = 0; i < deferreds.length; i++) {
                    if (arguments[i][1] === 'success') {
                        menifests.push(arguments[i][0]);
                    }
                }
            }
            if (deferreds.length === menifests.length) {
                processManifests(menifests, manifestUrls, bookParams);
            } else {
                err = new Error(); showError(1, err.lineNumber);
            }
        }).fail(function(jqxhr, textStatus, error) {
            err = new Error(); showError(1, err.lineNumber, textStatus + ', ' + error); //manifest.jsonの取得に失敗
        });
    }

    //manifest(s)の内容処理
    function processManifests(manifests, manifestUrls, bookParams, optPage) {
        var i, j;
        for (i = 0; i < manifests.length; i++) {
            var manifest = manifests[i];
            if (isValidManifestFalseTrue(manifest) || isValidTimelineFalseTrue(manifest)) {
                try {
                    var canvasesSummary = [];
                    $.each(manifest.sequences[0].canvases, function(_, val) {
                        //Image API Version
                        var imageApiVersion = '1.0';
                        var context = val.images[0].resource.service['@context']; //MUST
                        var contextStrings = {
                            'http://iiif.io/api/image/2/context.json': '2.0',
                            'http://library.stanford.edu/iiif/image-api/1.1/context.json': '1.1'
                        };
                        if ($.type(context) === 'string') {
                            imageApiVersion = contextStrings[context] || imageApiVersion;
                        } else if ($.isArray(context)) {
                            $.each(context, function(_, context_) {
                                if ($.type(context_) === 'string') {
                                    imageApiVersion = contextStrings[context_] || imageApiVersion;
                                }
                            });
                        }

                        //Image API Compliance Level
                        var imageComplianceLevel = -1;
                        var profile = val.images[0].resource.service.profile; //SHOULD（MUSTではない）
                        if ($.type(profile) === 'string') {
                            var match;
                            //IIIFの仕様では、Compliance Levelの記述は次のように指定することとなっている。
                            //Image API 2.x：http://iiif.io/api/image/2/level0.json
                            //Image API 1.1：http://library.stanford.edu/iiif/image-api/1.1/compliance.html#level0
                            //Image API 1.0：http://library.stanford.edu/iiif/image-api/compliance.html#level0
                            if (profile.indexOf('http://iiif.io/api/image/2/') === 0) {
                                match = profile.match(/level([0-2])\.json$/);
                                if (match) {
                                    imageComplianceLevel = parseInt(match[1], 10);
                                }
                            } else if (profile.indexOf('http://library.stanford.edu/iiif/image-api/') === 0) {
                                //例えば Harvard Art Museumsの manifestでは、仕様に反して
                                //http://library.stanford.edu/iiif/image-api/1.1/conformance.html#level1
                                //と記載している。こうしたサイトにも対応するため、判定基準を甘くする。
                                match = profile.match(/#level([0-2])$/);
                                if (match) {
                                    imageComplianceLevel = parseInt(match[1], 10);
                                }
                            }
                        }

                        //Canvasオブジェクトの抜粋
                        var canvasSummary = {
                            id : val['@id'],
                            label : val.label,
                            imageInfoUrl : val.images[0].resource.service['@id'] + '/info.json',
                            cursorIndex : getCursorIndexFromCanvas(val),
                            imageApiVersion : imageApiVersion,
                            imageComplianceLevel : imageComplianceLevel,
                            imageResourceId : val.images[0].resource['@id'], //Compliance Levelの低いサイトで画像全体を取得するために利用
                            thumbnail : val.thumbnail
                        };
                        canvasesSummary.push(canvasSummary);
                    });
                    var bookInfo = {
                        manifestUrl     : manifestUrls[i],
                        manifest        : manifest,
                        canvases        : canvasesSummary,
                        totalPagesNum   : canvasesSummary.length
                    };
                    bookInfos.push(bookInfo);
                } catch (e) {
                    //
                }
            }
        }
        manifestUrls = [];
        for (i = 0; i < bookInfos.length; i++) {
            manifestUrls.push(bookInfos[i].manifestUrl);
        }
        for (i = 0; i < bookParams.length; i++) {
            var bookParam = bookParams[i];
            var bookIndex = $.inArray(bookParam.manifestUrl, manifestUrls);
            if (bookIndex > -1) {
                if (bookInfos[bookIndex].totalPagesNum > 0) {
                    var pageInfo = {};
                    var pageInfosLocal = [];
                    if (bookParam.canvasIds) {
                        //curation.json内の"selections"で表示範囲が指定されている場合
                        for (j = 0; j < bookParam.canvasIds.length; j++) {
                            var canvasIdElems = bookParam.canvasIds[j].split('#');
                            var idx = $.inArray(canvasIdElems[0], getCanvasIds(bookIndex));
                            var fragment = void 0; //undefined
                            if (canvasIdElems.length > 1) {
                                fragment = canvasIdElems[1];
                            }
                            if (idx > -1) {
                                pageInfo = {
                                    bookIndex : bookIndex,
                                    pageLocal : idx + 1, //1-based（元資料でのページ番号）
                                    fragment  : fragment
                                };
                                pageInfosLocal.push(pageInfo);
                            }
                        }
                    }
                    if (pageInfosLocal.length > 0) {
                        pageInfos = pageInfos.concat(pageInfosLocal);
                    }
                }
            }
        }
        if (pageInfos.length === 0) {
            err = new Error(); showError(1, err.lineNumber); //データ異常
            return;
        }

        //最初に表示するページ
        page = 0; //ページ指定がないときは、表示対象指定範囲の先頭ページを表示する。
        if ((optPage || optPage === 0) && /^(-?[0-9]+)$/.test(String(optPage))) {
            page = parseInt(String(optPage), 10);
            if (page < 0) {
                page = pageInfos.length + page;
            }
        } else {
            var match = location.search.match(/pos=([0-9]+?)(?:&|$)/);
            if (match) {
                page = parseInt(match[1], 10) - 1; //1-based to 0-based
            }
        }
        if (page < 0 || page > pageInfos.length - 1) {
            page = 0;
        }

        setupNavigations();

        //Manifest(s)のサムネイル一覧
        var tnList = '';
        for (i = 0; i < pageInfos.length; i++) {
            j = i + 1;
            var tnUrl = getThumbnailUrl(i);
            var bookIndexTn = pageInfos[i].bookIndex;
            var imageTitle = getPropertyValueI18n(bookInfos[bookIndexTn].manifest.label) + '/' + pageInfos[i].pageLocal; //manifest.labelはuncleanの可能性あり
            var $img = $('<img>').attr({ src: getPreloadImageData(), alt: imageTitle, title: imageTitle }).attr('data-original', tnUrl).attr('data-index', i);
            var $thumbnailLink = $('<a>').addClass('thumbnail thumbnail-custom').attr('href', 'javascript:void("showDetail");').append($img);
            var $addCartLink = $('<a>').attr('href', 'javascript:void("addCart");').addClass('thumbnail-cart-add btn-default btn-xs').html('<span class="glyphicon glyphicon-plus" aria-hidden="true"> </span>').attr('title', (lng !== 'ja') ? 'Add to List' : 'リストに入れる');
            var $label = $('<div>').addClass('thumbnail_label');
            if (isTimelineMode) {
                $label.text(getPropertyValueI18n(getCanvasLabel(i)));
            } else {
                var a = document.createElement('a');
                a.href = tnUrl;
                $label.text(a.hostname);
            }
            var $canvasThumbnail = $('<div>').addClass('canvas-thumbnail').append($thumbnailLink);
            if (storage) {
                $canvasThumbnail.append($addCartLink);
            }
            tnList += $('<li>').append($canvasThumbnail.append($label)).prop('outerHTML');
        }
        $('#thumbnails_container').html(tnList);

        var curationLabel;
        if (curationInfo && curationInfo.curation && curationInfo.curation.label) {
            curationLabel = getPropertyValueI18n(curationInfo.curation.label);
        }
        if (curationLabel) {
            $('#thumbnails_num').text(curationLabel + '：' + pageInfos.length + ((lng !== 'ja') ? ' images' : '画像'));
        } else {
            $('#thumbnails_num').text(pageInfos.length + ((lng !== 'ja') ? ' results' : ' 件'));
        }

        if (storage) {
            $('.thumbnail-cart-add').on('click', function() {
                //カートへ追加
                var $img = $(this).closest('div').find('img');
                if ($img.length > 0) {
                    var index = $img.attr('data-index');
                    if (!getFavState(index)) {
                        toggleFav(index);
                    }
                }
            });
        }
        $('.thumbnail-custom').on('click', function() {
            //詳細表示
            var $img = $(this).find('img');
            if ($img.length > 0) {
                var index = $img.attr('data-index');
                switchMode('canvasDetail');
                showCanvasDetail(index, { isCurationData: true });
            }
        });

        //負荷軽減のため遅延表示
        $('a.thumbnail img').lazyload({
            event  : 'turnPage',
            effect : 'show'
        });

        //可視状態になってからjPagesの設定を行わないと正しく動作しないため
        var THUMBNAILS_NUM_PER_PAGE = 20;
        var thumbnailsPage = Math.floor(page / THUMBNAILS_NUM_PER_PAGE) + 1;
        $('#thumbnails_nav').show();
        $('#thumbnails_nav2').hide();
        if ($('#thumbnails_nav').text() === '') {
            $('#thumbnails_nav').jPages({
                containerID : 'thumbnails_container',
                previous    : '«',
                next        : '»',
                animation   : '',
                fallback    : 1,
                delay       : 0,
                perPage     : THUMBNAILS_NUM_PER_PAGE,
                startPage   : thumbnailsPage,
                keyBrowse   : false,
                callback    : function(pages, items){
                    items.showing.find('img').trigger('turnPage');
                    items.oncoming.find('img').trigger('turnPage');
                    $('#thumbnails_container li a').eq(page).focus();
                }
            });
        } else {
            $('#thumbnails_nav').jPages(thumbnailsPage);
            $('#thumbnails_container li a').eq(page).focus();
        }

        //キュレーションタブで表示（キャンバスタブへの切り替えは無効化）
        $('#search_select_canvas').removeClass('active').addClass('disabled');
        $('#search_select_canvas_link').attr('href', '#');
        $('#search_select_curation').addClass('active');
        $('#search_select_tab').show();
    }

    //----------------------------------------------------------------------
    //---------- クエリ関係 ----------
    //検索結果の取得 → processSelectCanvasQueryResultまたはprocessSelectCurationQueryResultで内容処理
    function processQuery(searchWord, queryOptions_) {
        // パラメータ名            取りうる値
        // ---------------------------------------------
        // ・ファセット検索
        // select                  curation, canvas
        // from                    curation, canvas
        // where_metadata_label    任意
        // where_metadata_value    任意
        // ・非ファセット検索
        // select                  curation, canvas
        // from                    curation, canvas
        // where                   任意
        // where_agent             human, machine
        // ---------------------------------------------
        var queryOptions = queryOptions_ || {};
        var select = (params.select === 'canvas') ? 'canvas' : 'curation';
        var from = '';
        if (params.from) {
            var fromParams = String(params.from).split(',');
            var froms = [];
            if ($.inArray('canvas', fromParams) > -1) {
                froms.push('canvas');
            }
            if ($.inArray('curation', fromParams) > -1) {
                froms.push('curation');
            }
            from = froms.join(',');
        }
        from = from || 'canvas,curation';
        var start = parseIntWithDefault(queryOptions.start, 0);
        var limit = parseIntWithDefault(queryOptions.limit, (select === 'canvas') ? 20 : 10);
        var agents = '';
        var params_ = [];
        params_.push('select=' + select);
        params_.push('from=' + from);
        if ($.isPlainObject(searchWord) && 'label' in searchWord && 'value' in searchWord) {
            //ファセット検索
            params_.push('where_metadata_label=' + encodeURIComponent(searchWord.label));
            params_.push('where_metadata_value=' + encodeURIComponent(searchWord.value));
        } else {
            //非ファセット検索
            params_.push('where=' + encodeURIComponent(searchWord));
            if (params.where_agent !== undefined) {
                var agentParams = String(params.where_agent).split(',');
                agents = [];
                if ($.inArray('human', agentParams) > -1) {
                    agents.push('human');
                }
                if ($.inArray('machine', agentParams) > -1) {
                    agents.push('machine');
                }
                agents = agents.join(',');
                params_.push('where_agent=' + agents);
            }
        }
        params_.push('limit=' + limit);
        params_.push('start=' + start); //offset
        var queryUrl = conf.service.searchEndpointUrl + '?' + params_.join('&');
        var queryParams = {
            select: select,
            from: from,
            searchWord: searchWord,
            limit: limit,
            start: start,
            agent: agents
        };

        $.getJSON(queryUrl, function(results) {
            if ($.isPlainObject(results) && results.results) {
                if (select === 'canvas') {
                    processSelectCanvasQueryResult(results, queryParams); //検索結果（キャンバスのリスト）の処理
                } else if (select === 'curation') {
                    processSelectCurationQueryResult(results, queryParams); //検索結果（キュレーションのリスト）の処理
                } else {
                    err = new Error(); showError(1, err.lineNumber); //異常
                }
            } else {
                err = new Error(); showError(1, err.lineNumber); //json異常（invalidもしくは対応外の内容）
            }
        }).fail(function(jqxhr, textStatus, error) {
            err = new Error(); showError(1, err.lineNumber, textStatus + ', ' + error); //jsonの取得に失敗
        });
    }
    //検索結果（キャンバスのリスト）の処理
    function processSelectCanvasQueryResult(queryResults, queryParams) {
        //（「キャンバスのメタデータを検索対象とする検索」という意味ではなく、検索結果がキャンバス単位で得られる検索）
        if (queryResults.results) {
            //JSONfinderからの受け取りデータでは、オブジェクトのプロパティ名を整理している。
            //受け取り側内部でのfavオブジェクトは、IIIF Curation Viewerとのコード統一などを
            //考慮して従来のままとし（IIIF Curation Viewerでは後方互換性維持のため変更困難）、
            //JSONfinderから検索結果を受け取った際に、プロパティ名を調整して対応する。
            $.each(queryResults.results, function(_, val) {
                if ('canvasCursorIndex' in val && 'canvasIndex' in val && !('pageLocal' in val)) {
                    var canvasIndex = val.canvasIndex;
                    val.canvasIndex = val.canvasCursorIndex;
                    val.pageLocal = canvasIndex;
                }
            });
        }
        canvasQueryResults = queryResults;
        var total = parseIntWithDefault(queryResults.total, 0);
        var results = queryResults.results;

        var searchWord = queryParams.searchWord;
        var limit = parseIntWithDefault(queryParams.limit, 20);
        var start = parseIntWithDefault(queryParams.start, 0);

        //検索結果（キャンバスのリスト）のサムネイル一覧
        var i;
        var tnList = '';
        for (i = 0; i < results.length; i++) {
            var fav = results[i];
            var tnUrl = fav.canvasThumbnail;
            var imageTitle = getPropertyValueI18n(fav.manifestLabel) + '/' + fav.pageLocal; //manifest.labelはuncleanの可能性あり
            var $img = $('<img>').attr({ src: getPreloadImageData(), alt: imageTitle, title: imageTitle }).attr('data-original', tnUrl).attr('data-index', i);
            var $thumbnailLink = $('<a>').addClass('thumbnail thumbnail-custom').attr('href', 'javascript:void("showDetail");').append($img);
            var $addCartLink = $('<a>').attr('href', 'javascript:void("addCart");').addClass('thumbnail-cart-add btn-default btn-xs').html('<span class="glyphicon glyphicon-plus" aria-hidden="true"> </span>').attr('title', (lng !== 'ja') ? 'Add to List' : 'リストに入れる');
            var $label = $('<div>').addClass('thumbnail_label');
            if (isTimelineMode) {
                $label.text(getPropertyValueI18n(fav.canvasLabel));
            } else {
                var a = document.createElement('a');
                a.href = tnUrl;
                $label.text(a.hostname);
            }
            var $canvasThumbnail = $('<div>').addClass('canvas-thumbnail').append($thumbnailLink);
            if (storage) {
                $canvasThumbnail.append($addCartLink);
            }
            tnList += $('<li>').append($canvasThumbnail.append($label)).prop('outerHTML');
        }
        $('#thumbnails_container').html(tnList);

        $('#thumbnails_num').text(((lng !== 'ja') ? '' : '検索結果 ') + total + ((lng !== 'ja') ? ' results' : ' 件'));
        if ($.isPlainObject(searchWord) && 'label' in searchWord && 'value' in searchWord) {
            $('.facet_tag_generic').show();
        }

        if (storage) {
            $('.thumbnail-cart-add').on('click', function() {
                //カートへ追加
                var $img = $(this).closest('div').find('img');
                if ($img.length > 0) {
                    var index = $img.attr('data-index');
                    var fav = canvasQueryResults.results[index];
                    if (getFavIndex(-1, fav) === -1) {
                        //追加
                        var favData = getFavs();
                        favData.push(fav);
                        setFavs(favData);
                        setupNavigations();
                    }
                }
            });
        }
        $('.thumbnail-custom').on('click', function() {
            //詳細表示
            var $img = $(this).find('img');
            if ($img.length > 0) {
                var index = $img.attr('data-index');
                switchMode('canvasDetail');
                showCanvasDetail(index);
            }
        });

        //負荷軽減のため遅延表示
        $('a.thumbnail img').lazyload({
            effect : 'show'
        });

        //検索結果（キャンバスのリスト）ページャー
        var THUMBNAILS_NUM_PER_PAGE = limit;
        var thumbnailsPage = Math.floor(start / THUMBNAILS_NUM_PER_PAGE) + 1;
        $('#thumbnails_nav').hide();
        $('#thumbnails_nav2').html('<ul id="thumbnails_nav2_ul">').show();
        $('#thumbnails_nav2_ul').pagination({
            items: Math.ceil(total / THUMBNAILS_NUM_PER_PAGE),
            currentPage: thumbnailsPage,
            cssStyle: 'pagination',
            prevText: '<span aria-hidden="true">&laquo;</span>',
            nextText: '<span aria-hidden="true">&raquo;</span>',
            hrefTextPrefix: 'javascript:void(',
            hrefTextSuffix: ');',
            onPageClick: function(pageNumber) {
                var queryParams_ = queryParams;
                queryParams_.start = THUMBNAILS_NUM_PER_PAGE * (pageNumber - 1);
                processQuery(searchWord, queryParams_);
            }
        });

        //検索結果（キュレーションのリスト）に切り替えるためのリンク
        var selectCurationUrl = getQueryUrl('curation', searchWord);
        $('#search_select_curation').removeClass('active');
        $('#search_select_curation_link').attr('href', selectCurationUrl);
        $('#search_select_canvas').addClass('active');
        $('#search_select_tab').show();

        updateHistory(queryParams);
    }
    //検索結果（キュレーション一覧）の処理
    function processSelectCurationQueryResult(queryResults, queryParams) {
        //（「キュレーションのメタデータを検索対象とする検索」という意味ではなく、検索結果がキュレーション単位で得られる検索）
        var total = parseIntWithDefault(queryResults.total, 0);
        var results = queryResults.results;

        var searchWord = queryParams.searchWord;
        var limit = parseIntWithDefault(queryParams.limit, 10);
        var start = parseIntWithDefault(queryParams.start, 0);

        //検索結果（キュレーションのサムネイルとラベル等）をリスト表示
        var i;
        var tnList = '';
        for (i = 0; i < results.length; i++) {
            var record = results[i];
            var tnUrl = record.curationThumbnail;
            var imageTitle = getPropertyValueI18n(record.curationLabel); //labelはuncleanの可能性あり
            var $img = $('<img>').attr({ src: getPreloadImageData(), alt: imageTitle, title: imageTitle }).attr('data-original', tnUrl);
            var params_ = [];
            params_.push('curation=' + record.curationUrl);
            if (lng !== 'ja') {
                params_.push('lang=' + lng);
            }
            var joinedParams = params_.join('&');
            var viewerUrl = conf.service.curationViewerUrl + '?' + joinedParams;
            var $thumbnailLink = $('<a>').addClass('thumbnail curation-thumbnail-custom').attr('href', viewerUrl).append($img);
            var $curationLink = $('<div>').append($('<a>').addClass('curation_title_link').attr('href', viewerUrl).text(imageTitle));
            var $totalImages = $('<div>').text(record.totalImages + ((lng !== 'ja') ? ' images' : '画像'));
            var $timestamp = $('<small>').text(record.crawledAt);
            var $edit = $('<a>').addClass('btn btn-default btn-xs').attr('href', '?' + joinedParams).html('<span class="glyphicon glyphicon-th"></span>').attr('title', (lng !== 'ja') ? 'View canvases' : 'キュレーションに含まれるキャンバスを表示');
            var $editDiv = $('<div>').append($edit);
            var $thumbnail = $('<div>').addClass('col-xs-2 col-sm-2 col-md-2 col-lg-2 col-fixed-140').append($thumbnailLink);
            var $description = $('<div>').addClass('col-xs-7 col-sm-7 col-md-7 col-lg-7').append($curationLink).append($totalImages).append($timestamp).append($editDiv);
            var row = $('<div>').addClass('row row-curation-custom col-md-6').append($thumbnail).append($description).prop('outerHTML');
            tnList += row;
        }
        $('#curation_thumbnails_container').html(tnList);

        $('#thumbnails_num').text(((lng !== 'ja') ? '' : '検索結果 ') + total + ((lng !== 'ja') ? ' results' : ' 件'));
        if ($.isPlainObject(searchWord) && 'label' in searchWord && 'value' in searchWord) {
            $('.facet_tag_generic').show();
        }

        //負荷軽減のため遅延表示
        $('a.thumbnail img').lazyload({
            effect : 'show'
        });

        //検索結果（キュレーションのリスト）ページャー
        var THUMBNAILS_NUM_PER_PAGE = limit;
        var thumbnailsPage = Math.floor(start / THUMBNAILS_NUM_PER_PAGE) + 1;
        $('#thumbnails_nav').hide();
        $('#thumbnails_nav2').html('<ul id="thumbnails_nav2_ul">').show();
        $('#thumbnails_nav2_ul').pagination({
            items: Math.ceil(total / THUMBNAILS_NUM_PER_PAGE),
            currentPage: thumbnailsPage,
            cssStyle: 'pagination',
            prevText: '<span aria-hidden="true">&laquo;</span>',
            nextText: '<span aria-hidden="true">&raquo;</span>',
            hrefTextPrefix: 'javascript:void(',
            hrefTextSuffix: ');',
            onPageClick: function(pageNumber) {
                var queryParams_ = queryParams;
                queryParams_.start = THUMBNAILS_NUM_PER_PAGE * (pageNumber - 1);
                processQuery(searchWord, queryParams_);
            }
        });

        //検索結果（キャンバスのリスト）に切り替えるためのリンク
        var selectCanvasUrl = getQueryUrl('canvas', searchWord);
        $('#search_select_curation').addClass('active');
        $('#search_select_canvas').removeClass('active');
        $('#search_select_canvas_link').attr('href', selectCanvasUrl);
        $('#search_select_tab').show();

        updateHistory(queryParams);
    }
    //ファセット一覧の取得と処理
    function processFacetsList() {
        if (conf.enableFacetedSearch) {
            var facetsEndpointUrl = config.service.facetsEndpointUrl;
            if (facetsEndpointUrl) {
                var $list = $('<ul>');
                $.getJSON(facetsEndpointUrl, function(facetsList) {
                    if ($.isPlainObject(facetsList) && facetsList.facets && $.isArray(facetsList.facets)) {
                        for (var i = 0; i < facetsList.facets.length; i++) {
                            var facet = facetsList.facets[i];
                            if ($.isPlainObject(facet) && facet.label && facet.value && $.isArray(facet.value)) {
                                var facetLabel = getPropertyValueI18n(facet.label);
                                var labelSpan = $('<span>').text(facetLabel).prop('outerHTML');
                                var $li = $('<li>').html('<span class="glyphicon glyphicon-tag"></span> ' + labelSpan);
                                var $subul = $('<ul>').addClass('facets_sublist');
                                for (var j = 0; j < facet.value.length; j++) {
                                    var value = facet.value[j];
                                    var value_;
                                    var num = -1;
                                    if ($.type(value) === 'string') {
                                        value_ = value;
                                    } else if ($.isPlainObject(value) && value.label) {
                                        value_ = getPropertyValueI18n(value.label);
                                        if ('value' in value && $.isNumeric(value.value)) {
                                            num = parseInt(value.value, 10);
                                        }
                                    }
                                    var facetedQueryUrl = getFacetedQueryUrl(facetLabel, value_);
                                    var tagType = 'facet_tag';
                                    var tooltip = 'human-generated tag';
                                    if ($.isPlainObject(value) && value.agent === 'machine') {
                                        tagType = 'facet_tag2';
                                        tooltip = 'machine-generated tag';
                                    }
                                    if (num > -1) {
                                        value_ += ' (' + num + ')';
                                    }
                                    var $link = $('<a>').addClass('btn btn-default btn-xs ' + tagType).attr('href', facetedQueryUrl).attr('title', tooltip).text(value_);
                                    var $subli = $('<li>').append($link);
                                    $subul.append($subli);
                                }
                                $li.append($subul);
                                $list.append($li);
                            }
                        }
                        $('#facets_list').append($list);
                    } else {
                        err = new Error(); showError(0, err.lineNumber); //json異常
                    }
                }).fail(function(jqxhr, textStatus, error) {
                    err = new Error(); showError(0, err.lineNumber, textStatus + ', ' + error); //jsonの取得に失敗
                });
            }
        }
    }

    //キャンバス詳細画面の表示
    function showCanvasDetail(page_, options) {
        var manifestUrl;
        var manifestLabel_;
        var manifestAttribution;
        var manifestLogo;
        var imageInfoUrl;
        var canvasId;
        var pageLocal;
        var fragment;
        var cursorIndex;
        var metadata;
        var dataSource = 'queryResults'; //検索結果（キャンバスのリスト）から
        if (options) {
            if (options.isCurationData) {
                //キュレーション内キャンバス一覧画面（curationパラメータ指定時）から
                dataSource = 'curation';
            } else if (options.isFavData) {
                //キュレーションエクスポート画面から
                dataSource = 'fav';
            }
        }
        if (dataSource === 'curation') {
            //キュレーション内キャンバス一覧画面（curationパラメータ指定時）から
            var bookIndex = pageInfos[page_].bookIndex;
            manifestUrl = bookInfos[bookIndex].manifestUrl;
            var manifest = bookInfos[bookIndex].manifest;
            manifestLabel_ = manifest.label;
            manifestAttribution = manifest.attribution;
            manifestLogo = manifest.logo;
            imageInfoUrl = getCanvasImageInfoUrl(page_);
            canvasId = getCanvasId(page_);
            cursorIndex = getCanvasCursorIndex(page_);
            pageLocal = pageInfos[page_].pageLocal; //1-based
            fragment = pageInfos[page_].fragment;
            metadata = getCanvasMetadata(page_);
        } else {
            var fav;
            if (dataSource === 'fav') {
                //キュレーションエクスポート画面から
                var favs = getFavs();
                fav = favs[page_];
            } else {
                //検索結果（キャンバスのリスト）から
                fav = canvasQueryResults.results[page_];
            }
            manifestUrl = fav.manifestUrl;
            manifestLabel_ = fav.manifestLabel;
            //manifestAttribution = fav.attribution; //favにはない項目
            //manifestLogo = fav.logo; //favにはない項目
            imageInfoUrl = fav.canvas;
            canvasId = fav.canvasId;
            cursorIndex = fav.canvasIndex;
            pageLocal = fav.pageLocal; //1-based
            fragment = fav.fragment;
            metadata = fav.metadata;
        }

        //資料名
        var manifestLabel = getPropertyValueI18n(manifestLabel_);
        $('#book_title').text(manifestLabel);

        var params_ = [];
        if (isTimelineMode) {
            params_.push('timeline=' + manifestUrl);
            if (cursorIndex !== null) {
                params_.push('cursorIndex=' + cursorIndex);
            }
        } else {
            params_.push('manifest=' + manifestUrl);
            params_.push('pos=' + pageLocal); //1-based
        }
        if (lng !== 'ja') {
            params_.push('lang=' + lng);
        }
        var viewerUrl = conf.service.curationViewerUrl + '?' + params_.join('&');
        $('#detail_open_in_icv_link').attr('href', viewerUrl);

        var zoom = 0;
        var center = [0, 0];
        var fitBounds = true;
        var TILE_SIZE = 1024;
        var TILE_SIZE_DEFAULT = 256;
        if (map !== undefined) {
            if (TILE_SIZE > TILE_SIZE_DEFAULT) {
                map.spin(false);
            }
            map.remove();
        }
        map = L.map('image_canvas', {
            crs: L.CRS.Simple
        });
        var attribution = '';
        if (manifestAttribution) {
            attribution = $('<span>').text(getPropertyValueI18n(manifestAttribution)).prop('outerHTML');
            attribution = unescapeLimitedHtmlTag(attribution);
        }
        var iiif = L.tileLayer.iiif(imageInfoUrl, {
            tileSize: TILE_SIZE,
            fitBounds: fitBounds,
            attribution: attribution
        });
        iiif.id = 'iiif';
        map.addLayer(iiif);
        map.setView(center, zoom);
        if (TILE_SIZE > TILE_SIZE_DEFAULT) {
            var DELAY_TIME_TO_SHOW_SPIN = 200; //ms
            var isTileLoadDone = false;
            setTimeout(function() {
                if (isTileLoadDone === false) {
                    map.spin(true);
                }
            }, DELAY_TIME_TO_SHOW_SPIN); //読み込み済みページへの移動でも一瞬spinが表示されるのは見苦しいので遅延実行する
            iiif.on('load', function() {
                isTileLoadDone = true;
                map.spin(false);
            });
            iiif.on('tileerror', function() {
                isTileLoadDone = true;
                map.spin(false);
            });
            iiif.on('tileload', function() {
                isTileLoadDone = true;
                map.spin(false);
            });
        }
        iiif.on('load', function() {
            if (iiif.x && iiif.y) {
                //var fragment = pageInfos[page_].fragment;
                if (fragment) {
                    //https://www.w3.org/TR/media-frags/#naming-space
                    var match = fragment.match(/xywh=(?:pixel:)?([0-9]+),([0-9]+),([0-9]+),([0-9]+)/); //「percent:」は未対応
                    if (match) {
                        var x = parseInt(match[1], 10);
                        var y = parseInt(match[2], 10);
                        var w = parseInt(match[3], 10);
                        var h = parseInt(match[4], 10);

                        var minPoint = L.point(x, y);
                        var maxPoint = L.point(x + w, y + h);
                        var minLatLng = map.unproject(minPoint, iiif.maxNativeZoom);
                        var maxLatLng = map.unproject(maxPoint, iiif.maxNativeZoom);
                        var bounds = L.latLngBounds(minLatLng, maxLatLng);

                        iiif.off('load');
                        var polyHole = [bounds.getNorthWest(), bounds.getNorthEast(),
                            bounds.getSouthEast(), bounds.getSouthWest(), bounds.getNorthWest()];
                        L.rectangle(polyHole, {color: '#00BFFF', weight: 2, fillOpacity: 0}).addTo(map);

                        map.fitBounds(bounds);
                    }
                }
            }
        });
        if (manifestLogo) {
            var logoUrls = getUriRepresentations(manifestLogo);
            if ($.isArray(logoUrls) && logoUrls.length > 0) {
                var logoUrl = logoUrls[0];
                var credit = L.controlCredits({
                    image: logoUrl,
                    link: viewerUrl || 'javascript:void(0);',
                    text: 'More info...',
                    width: 24,
                    height: 32
                });
                credit.addTo(map);
            }
        }
        $('#detail_cart').attr('data-index', page_).attr('data-source', dataSource).prop('disabled', (dataSource === 'fav'));
        $('#detail_close').attr('data-source', dataSource);

        if (dataSource === 'curation') {
            //nop
        } else {
            //データ構造上、manifestAttributionとmanifestLogoの情報を持っていないので取得しにいく
            $.getJSON(manifestUrl, function(manifest) {
                if (isValidManifestFalseTrue(manifest) || isValidTimelineFalseTrue(manifest)) {
                    manifestAttribution = manifest.attribution;
                    if (manifestAttribution) {
                        attribution = $('<span>').text(getPropertyValueI18n(manifestAttribution)).prop('outerHTML');
                        attribution = unescapeLimitedHtmlTag(attribution);
                        map.attributionControl.addAttribution(attribution);
                    }
                    manifestLogo = manifest.logo;
                    if (manifestLogo) {
                        var logoUrls = getUriRepresentations(manifestLogo);
                        if ($.isArray(logoUrls) && logoUrls.length > 0) {
                            var logoUrl = logoUrls[0];
                            var credit = L.controlCredits({
                                image: logoUrl,
                                link: viewerUrl || 'javascript:void(0);',
                                text: 'More info...',
                                width: 24,
                                height: 32
                            });
                            credit.addTo(map);
                        }
                    }
                }
            }).fail(function(jqxhr, textStatus, error) {
                err = new Error(); showError(0, err.lineNumber, textStatus + ', ' + error); //jsonの取得に失敗
            });
        }

        //ドラッグ＆ドロップ用リンク
        if (isTimelineMode) {
            $('#detail_drag_n_drop_link').hide();
        } else {
            params_ = [];
            params_.push('manifest=' + manifestUrl);
            params_.push('canvas=' + canvasId);
            $('#detail_drag_n_drop_link').attr('href', manifestUrl + '?' + params_.join('&')).show();
        }

        //ファセット検索用タグ
        if (conf.enableFacetedSearch) {
            if (metadata) {
                if ($.isArray(metadata)) {
                    $('#detail_facet').text('');
                    $.each(metadata, function(_, val) {
                        if (val && 'label' in val && 'value' in val) {
                            var facetLabel = getPropertyValueI18n(val.label);
                            var facetValue = getPropertyValueI18n(val.value);
                            var label = facetLabel + '：' + facetValue;
                            var labelSpan = $('<span>').text(label).prop('outerHTML');
                            var facetedQueryUrl = getFacetedQueryUrl(facetLabel, facetValue);
                            var tagType = 'facet_tag';
                            var tooltip = 'human-generated tag';
                            if (val.agent === 'machine') {
                                tagType = 'facet_tag2';
                                tooltip = 'machine-generated tag';
                            }
                            var $link = $('<a>').addClass('btn btn-default btn-xs ' + tagType).attr('href', facetedQueryUrl).attr('title', tooltip).html('<span class="glyphicon glyphicon-tag"></span> ' + labelSpan);
                            $('#detail_facet').append($link);
                        }
                    });
                }
            }
        }
    }

    //----------------------------------------------------------------------
    function switchMode(mode_) {
        if (mode_ === 'curationSearch') {
            //検索結果（キュレーションのリスト）画面
            $('#search_container').show();
            $('#detail_container').hide();
            $('#cart_container').hide();

            $('#search_select').attr('value', 'curation');
            $('#facets_list').hide();
        } else if (mode_ === 'canvasSearch') {
            //検索結果（キャンバスのリスト）画面
            $('#search_container').show();
            $('#detail_container').hide();
            $('#cart_container').hide();

            $('#search_select').attr('value', 'canvas');
            $('#facets_list').hide();
        } else if (mode_ === 'canvasDetail') {
            //キャンバス詳細画面
            $('#search_container').hide();
            $('#detail_container').show();
            $('#cart_container').hide();

        } else if (mode_ === 'cart') {
            //キュレーションエクスポート画面
            $('#search_container').hide();
            $('#detail_container').hide();
            $('#cart_container').show();

            showCurationListCore();
        } else {
            //デフォルト画面
            $('#search_container').show();
            $('#detail_container').hide();
            $('#cart_container').hide();

            $('#facets_list').show();
        }
        mode = mode_;
        $(document).trigger('icf.switchMode', [mode]); //イベント送出
    }

    function setupUi() {
        //タイトル
        var title = getPropertyValueI18n(conf.title);
        $('#navbar_brand').html(title);
        document.title = $('#navbar_brand').text();

        //検索
        $('#search_word').attr('placeholder', (lng !== 'ja') ? 'Search' : '検索');
        $('#search_select_curation_link').text((lng !== 'ja') ? 'Curation' : 'キュレーション');
        $('#search_select_canvas_link').text((lng !== 'ja') ? 'Canvas' : 'キャンバス');
        $('#search_select_tab').hide();
        $('#search_lang').attr('value', lng);
        $('#search_options_collapse').attr('title', (lng !== 'ja') ? 'Search Options' : '検索オプション');
        $('#search_options_agent_heading').text((lng !== 'ja') ? 'Search within' : '検索対象メタデータ');
        $('#agent_human').text((lng !== 'ja') ? 'Human-generated metadata' : '人間付与');
        $('#agent_machine').text((lng !== 'ja') ? 'Machine-generated metadata' : '機械生成');
        $('.facet_tag_generic').hide();

        //キュレーションリスト（カート）画面
        $('#curation_list_title').text((lng !== 'ja') ? 'Curating list' : 'キュレーションリスト');
        $('#curation_label_span').text((lng !== 'ja') ? 'Title' : 'タイトル');
        $('#curation_description_span').text((lng !== 'ja') ? 'Description' : '説明');
        $('#curation_description').attr('placeholder', (lng !== 'ja') ? '(Optional)' : '（任意項目）')
            .on('shown.bs.collapse', function() {
                $('#curation_description_collapse').html('<span class="glyphicon glyphicon-chevron-up"></span>');
            }).on('hidden.bs.collapse', function() {
                $('#curation_description_collapse').html('<span class="glyphicon glyphicon-chevron-down"></span>');
            });
        $('#curation_selections_span').text((lng !== 'ja') ? 'Selections' : 'セレクション');
        $('#curation_list_clear').html('<span class="glyphicon glyphicon-remove"></span> ' + ((lng !== 'ja') ? 'Clear All' : '全てクリア'))
            .attr('title', (lng !== 'ja') ? 'Clear this list' : 'キュレーションリストをクリア');
        $('#curation_list_export').html('<span class="glyphicon glyphicon-export"></span> ' + ((lng !== 'ja') ? 'Export' : '投稿する'))
            .attr('title', (lng !== 'ja') ? 'Export this list' : 'キュレーションリストをエクスポート');
        $('#curation_list_close').html(((lng !== 'ja') ? 'Return' : '戻る'));
        $('#curation_list_close').on('click', function() {
            var mode_;
            if (params) {
                if (params.select === 'canvas') {
                    mode_ = 'canvasSearch';
                } else if (params.select === 'curation') {
                    mode_ = 'curationSearch';
                } else if (params.curation) {
                    mode_ = 'curationSearch';
                }
            }
            switchMode(mode_);
        });
        setupCurationListEvents(); //キュレーションリスト作成関係イベント登録

        //キャンバス詳細画面
        $('#detail_close').text((lng !== 'ja') ? 'Return' : '戻る').on('click', function() {
            var mode_;
            var dataSource = $(this).attr('data-source');
            if (dataSource === 'queryResults') {
                //検索結果（キャンバスのリスト）から
                mode_ = 'canvasSearch';
            } else if (dataSource === 'curation') {
                //キュレーション内キャンバス一覧画面（curationパラメータ指定時）から
                mode_ = 'curationSearch';
            } else if (dataSource === 'fav') {
                //キュレーションエクスポート画面から
                mode_ = 'cart';
            }
            switchMode(mode_);
        });
        if (storage) {
            $('#detail_cart_text').text((lng !== 'ja') ? 'Add to List' : 'リストに入れる');
            $('#detail_cart').on('click', function() {
                var index = $(this).attr('data-index');
                var dataSource = $(this).attr('data-source');
                if (dataSource === 'queryResults') {
                    //検索結果（キャンバスのリスト）から
                    if ($.isPlainObject(canvasQueryResults) && $.isArray(canvasQueryResults.results) && canvasQueryResults.results.length > 0) {
                        var fav = canvasQueryResults.results[index];
                        if (getFavIndex(-1, fav) === -1) {
                            //追加
                            var favData = getFavs();
                            favData.push(fav);
                            setFavs(favData);
                            setupNavigations();
                        }
                    }
                } else if (dataSource === 'curation') {
                    //キュレーション内キャンバス一覧画面（curationパラメータ指定時）から
                    if (!getFavState(index)) {
                        toggleFav(index);
                    }
                } else if (dataSource === 'fav') {
                    //キュレーションエクスポート画面から
                    //トグル処理ではなく追加処理なので、すでに追加済みであるここでは何もしなくてよい。
                }
            });
        } else {
            $('#detail_cart').hide();
        }
        $('#detail_open_in_icv_link').attr('title', (lng !== 'ja') ? 'Open in IIIF Curation Viewer' : 'IIIF Curation Viewerで開く');
        $('#detail_drag_n_drop_link').attr('title', (lng !== 'ja') ? 'Drag and Drop' : 'ドラッグ＆ドロップ');

        //ヘッダ
        if (storage) {
            $('#navbar_cart_label').text(((lng !== 'ja') ? 'List' : 'リスト'));
            $('#navbar_cart_li').on('click', function() {
                var favData = getFavs();
                if (favData.length > 0) {
                    switchMode('cart');
                }
            });
        } else {
            $('#navbar_cart_li').hide();
        }
        var $navbar_brand_link = $('a#navbar_brand');
        if (!$navbar_brand_link.attr('data-href-orig')) { //オリジナルのhrefを待避
            $navbar_brand_link.attr('data-href-orig', $navbar_brand_link.attr('href'));
        }
        var hrefOrig = $navbar_brand_link.attr('data-href-orig');
        var hrefNew = hrefOrig;
        if (lng !== 'ja') {
            if (String(hrefOrig).indexOf('?') > -1) {
                hrefNew = hrefOrig + '&lang=en';
            } else {
                hrefNew = hrefOrig + '?lang=en';
            }
        }
        $navbar_brand_link.attr('href', hrefNew);

        setupNavigations();
        switchMode();
    }
    function setupNavigations() {
        //ヘッダのカートバッジ更新
        var cartBadge = '#navbar_cart_badge';
        var favData = getFavs();
        var oldVal = parseInt($(cartBadge).text(), 10);
        var newVal = favData.length;
        if (newVal !== oldVal) {
            var animations = 'webkitAnimationEnd mozAnimationEnd MSAnimationEnd oanimationend animationend';
            if (!$.isNumeric(oldVal)) {
                $(cartBadge).text(newVal > 0 ? newVal : '');
                $(cartBadge).addClass('animated fadeIn').one(animations, function() {
                    $(cartBadge).removeClass('animated fadeIn');
                });
            } else {
                $(cartBadge).addClass('animated fadeOut').one(animations, function() {
                    $(cartBadge).removeClass('animated fadeOut');
                    $(cartBadge).text(newVal > 0 ? newVal : '');
                    if (newVal > 0) {
                        $(cartBadge).addClass('animated fadeIn').one(animations, function() {
                            $(cartBadge).removeClass('animated fadeIn');
                        });
                    }
                });
            }
        }
        if (favData.length === 0 && mode === 'cart') {
            //カートが空になれば、モード移行
            var mode_;
            if (params) {
                if (params.select === 'canvas') {
                    mode_ = 'canvasSearch';
                } else if (params.select === 'curation') {
                    mode_ = 'curationSearch';
                } else if (params.curation) {
                    mode_ = 'curationSearch';
                }
            }
            switchMode(mode_);
        }

        //表示言語切り替え
        if ($('.nav_lang_ja').length && $('.nav_lang_en').length) {
            if (lng !== 'ja') {
                var $ja = $('<a>').attr('href', '?lang=ja').text('日本語');
                $('.nav_lang_ja').html($ja).attr('title', '日本語');
                $('.nav_lang_en').text('English');
            } else {
                var $en = $('<a>').attr('href', '?lang=en').text('English');
                $('.nav_lang_ja').text('日本語');
                $('.nav_lang_en').html($en).attr('title', 'in English');
            }
        }
    }

    //----------------------------------------------------------------------
    function updateHistory(queryParams) {
        if (history.replaceState && history.state !== undefined) {
            var newUrl = getPageLink(lng, queryParams);
            history.replaceState(null, document.title, newUrl);
        }
    }
    function getPageLink(lang, queryParams) {
        var localLang = lang || lng;
        var newUrl = location.protocol + '//' + location.host + location.pathname;
        var params_ = [];
        //表示対象指定
        if (queryParams) {
            params_.push('select=' + queryParams.select);
            //params_.push('from=' + queryParams.from);
            var searchWord = queryParams.searchWord;
            if ($.isPlainObject(searchWord) && 'label' in searchWord && 'value' in searchWord) {
                //ファセット検索
                params_.push('where_metadata_label=' + encodeURIComponent(searchWord.label));
                params_.push('where_metadata_value=' + encodeURIComponent(searchWord.value));
            } else {
                //非ファセット検索
                params_.push('where=' + encodeURIComponent(searchWord));
                if (queryParams.agent !== undefined) {
                    params_.push('where_agent=' + queryParams.agent);
                }
            }
            var start = parseIntWithDefault(queryParams.start, 0);
            if (start) {
                params_.push('start=' + start);
            }
        }
        //表示言語指定
        if (localLang !== 'ja') {
            params_.push('lang=' + localLang);
        }
        if (params_.length > 0) {
            newUrl += '?' + params_.join('&');
        }
        return newUrl;
    }
    function getFacetedQueryUrl(facetLabel, facetValue) {
        var facetedQueryUrl = '';
        var params_ = [];
        params_.push('select=' + 'canvas');
        params_.push('where_metadata_label=' + encodeURIComponent(facetLabel));
        params_.push('where_metadata_value=' + encodeURIComponent(facetValue));
        if (lng !== 'ja') {
            params_.push('lang=' + lng);
        }
        facetedQueryUrl = '?' + params_.join('&');
        return facetedQueryUrl;
    }
    function getQueryUrl(select, searchWord) {
        var params_ = [];
        params_.push('select=' + select);
        if ($.isPlainObject(searchWord) && 'label' in searchWord && 'value' in searchWord) {
            //ファセット検索
            params_.push('where_metadata_label=' + encodeURIComponent(searchWord.label));
            params_.push('where_metadata_value=' + encodeURIComponent(searchWord.value));
        } else {
            //非ファセット検索
            params_.push('where=' + encodeURIComponent(searchWord));
            var agents = [];
            if ($('#where_agent_human').prop('checked')) {
                agents.push('human');
            }
            if ($('#where_agent_machine').prop('checked')) {
                agents.push('machine');
            }
            var agent = agents.join(',');
            if (agent) {
                params_.push('where_agent=' + agent);
            }
        }
        if (lng !== 'ja') {
            params_.push('lang=' + lng);
        }
        return '?' + params_.join('&');
    }
    function getPreloadImageData() {
        // the preload image embedded below has taken form 'jPages' released under the MIT license, Copyright (c) 2011 by Luís Almeida.
        return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAH4AAAB+CAIAAABtQTLfAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAALiSURBVHhe7d27cuowGEVh3v8F3bmjc0VFR2zLFr98CR7GYmXCosokkvbh80YS1bk0viCBC5RrbCM9VgLppccEsGBbLz0mgAXbeukxASzY1kuPCWDBtl56TAALtvXSYwJYsK2XHhPAgm299JgAFmzrpccEsGBbLz0mgAXbeukxASzY1kuPCWDBtl56TAALtvXSYwJYsK2XHhPAgm299JgAFmzrpccEsGBbLz0mgAXbeukxASzY1kuPCWDBtl56TAALtvXSYwJYsK2XHhPAgm299JgAFmzrpccEsGBbLz0mgAXbeukxASz4M61vu/vj3rUnv8vr7fG4XftF6yx/8r92tdy/oK+NVGd96eu4HlgVpx82i+k1bh7TK/y6/2vYrIZdZnzdu2614aSd57q5ZJg4DIhhB5wqDGHpR+AJIf6cd/HhHYc/DL+fH0OiLPf69MDmEa8nVgA9viRKXwg3zfPYbIsTOZ+i5finbB4QH188fvcmHneqMJKmj/eexUUl7xBpe2lXF5lh/Lr1YcV5weUNKE+sAHp8yb9Jn9TjxiH98WdajNy5eMetux+ft4X+h/hpyMN2N6j5a8MiZ2enega9+XbOmYa2Pp6ge6fpdNVJj2L8NEzH8t4xu7HhpIkb5/M5hm+u8jn6+QqZ74bpKN2+XIZ9vheLbT9wucxndPEh2Jq4+9GMM2t9V/4M/Zu9qDVtsaHVinmx7nfQF4fK4gYKwTdf83+VFN+O+W+yw/P+jtZjzf4tWHrssUgvPSaABdt66TEBLNjWS48JYMG2XnpMAAu29dJjAliwrZceE8CCbb30mAAWbOulxwSwYFsvPSaABdt66TEBLNjWS48JYMG2XnpMAAu29dJjAliwrZceE8CCbb30mAAWbOulxwSwYFsvPSaABdt66TEBLNjWS48JYMG2XnpMAAu29dJjAliwrZceE8CCbb30mAAWbOulxwSwYFsvPSaABdt66TEBLNjWY/Q/NwKdVKPqVCYAAAAASUVORK5CYII=';
    }
    function parseIntWithDefault(arg, defaultValue) {
        var result = defaultValue || 0;
        var result_ = parseInt(arg, 10);
        if (!isNaN(result_)) {
            result = result_;
        }
        return result;
    }

    //----------------------------------------------------------------------
    //エラー表示
    function showError(errtype, lineNumber, message) {
        if (errtype === 1) {
            $('#book_title').html('<div class="alert alert-warning">' + ((lng !== 'ja') ? 'Unable to download data' : 'データ取得に失敗しました') + '</div>');
        }
        if (errtype && window.console) {
            var msg = 'IIIF Curation Finder Error';
            var details = [];
            if (lineNumber) {  //行番号を取得できるのはFirefoxのみ
                details.push('line: ' + lineNumber);
            }
            if (message) {
                details.push(message);
            }
            if (details.length > 0) {
                msg += ' (' + details.join(', ') + ')';
            }
            console.log(msg); // eslint-disable-line no-console
        }
    }

    //----------------------------------------------------------------------
    //キュレーションリスト登録関係
    function getFavs() {
        var favs;
        if (storage) {
            favs = JSON.parse(storage.getItem('favs_editor'));
        }
        return favs || [];
    }
    function setFavs(favs) {
        if (storage) {
            storage.setItem('favs_editor', JSON.stringify(favs));
        }
    }
    function removeFavs() {
        if (storage) {
            storage.removeItem('favs_editor');
        }
    }
    function getFavState(page_) {
        return getFavIndex(page_) > -1;
    }
    function getFavIndex(page_, fav_) {
        if (storage) {
            var page__ = page_ || page;
            var fav = fav_ || makeFav(page__);
            var favData = getFavs();
            for (var i = 0; i < favData.length; i++) {
                if (favData[i] && fav &&
                    favData[i].manifestUrl === fav.manifestUrl &&
                    favData[i].canvasId === fav.canvasId &&
                    favData[i].fragment === fav.fragment) {
                    if (favData[i].indexInBrowsingCuration) {
                        if (favData[i].indexInBrowsingCuration === String(page__ + 1)) {
                            return i;
                        }
                    } else {
                        return i;
                    }
                }
            }
        }
        return -1;
    }
    function toggleFav(page_) {
        if (storage) {
            var page__ = page_ || page;
            var favData = getFavs();
            var idx = getFavIndex(page__);
            if (idx > -1) {
                //削除
                favData.splice(idx, 1);
            } else {
                //追加
                var options;
                if (getBrowsingCurationUrl()) {
                    var metadata = getCanvasMetadataFromCuration(getBrowsingCurationJson());
                    if (metadata.length === pageInfos.length) {
                        options = {
                            metadata: metadata[page__],
                            indexInBrowsingCuration: String(page__ + 1) //1-based
                        };
                    }
                }
                var fav = makeFav(page__, options);
                favData.push(fav);
            }
            setFavs(favData);
            setupNavigations();
        }
    }
    function makeFav(page_, options) {
        var bookIndex = pageInfos[page_].bookIndex;
        var pageLocal = pageInfos[page_].pageLocal;
        var fragment  = pageInfos[page_].cropFragment || pageInfos[page_].fragment;
        var manifestUrl   = bookInfos[bookIndex].manifestUrl;
        var manifestLabel = bookInfos[bookIndex].manifest.label;
        var canvasInfoUrl = getCanvasImageInfoUrl(page_);
        var canvasId      = getCanvasId(page_);
        var canvasIndex   = getCanvasCursorIndex(page_);
        var canvasLabel   = getCanvasLabel(page_);
        var canvasThumbnail = getThumbnailUrl(page_, getRegeionFromFragment(fragment), 100, 90);
        var fav = {
            manifestUrl   : manifestUrl,
            manifestLabel : manifestLabel,
            canvas        : canvasInfoUrl, //info.jsonのURL
            canvasId      : canvasId,
            canvasIndex   : canvasIndex, //cursorIndex
            canvasLabel   : canvasLabel,
            canvasThumbnail : canvasThumbnail, //サムネイルのURL
            pageLocal     : pageLocal,
            fragment      : fragment
        };
        if (options) {
            if (options.metadata) {
                fav.metadata = options.metadata;
            }
            if (options.indexInBrowsingCuration) {
                fav.indexInBrowsingCuration = options.indexInBrowsingCuration;
            }
        }
        return fav;
    }
    //キュレーションエクスポート画面関係
    function showCurationListCore() {
        if (storage) {
            var favData = getFavs();
            var contents = '';
            for (var i = 0; i < favData.length; i++) {
                if (favData[i]) {
                    var fav = favData[i];
                    var region = getRegeionFromFragment(fav.fragment);
                    var miniThumbnailUrl = fav.canvasThumbnail || fav.canvas.replace('/info.json', '/' + region + '/!100,90/0/default.jpg');
                    miniThumbnailUrl = miniThumbnailUrl.replace(/[(), '"]/g, '\\$&'); //https://www.w3.org/TR/CSS1/#url
                    var $removeButton = $('<button>').attr('type', 'button').addClass('close curation_list_li_close').html('&#0215');
                    var $div = $('<div>').addClass('curation_list_li_content').css('background-image', 'url("' + miniThumbnailUrl + '")');
                    var $li = $('<li>').addClass('ui-state-default curation_list_li').attr({ 'data-manifestUrl': fav.manifestUrl, 'data-canvasId': fav.canvasId });
                    if (fav.fragment) {
                        $li.attr('data-fragment', fav.fragment);
                    }
                    if (fav.indexInBrowsingCuration) {
                        $li.attr('data-indexInBrowsingCuration', fav.indexInBrowsingCuration);
                    }
                    var $a = $('<a>').attr('href', 'javascript:void(0);').addClass('btn-default btn-xs pull-right').text((lng !== 'ja') ? 'detail' : '詳細');
                    var $div2 = $('<div>').addClass('curation_list_detail').append($a);
                    contents += $li.append($div.prepend($removeButton)).append($div2).prop('outerHTML');
                }
            }
            $('#curation_list_ul').html(contents);
            $('#curation_list_ul').sortable();
            $('.curation_list_li_close').on('click', function() {
                var $li = $(this).closest('li');
                if ($li.length > 0) {
                    $li.fadeOut('fast', function() {
                        $(this).remove();
                        updateCurationListData();
                        updateCurationListButtons();
                        setupNavigations();
                    });
                }
            });
            $('.curation_list_detail > a').on('click', function() {
                var $this = $(this).closest('li');
                var manifestUrl = $this.attr('data-manifestUrl');
                var canvasId = $this.attr('data-canvasId');
                var fragment = $this.attr('data-fragment');
                var indexInBrowsingCuration = $this.attr('data-indexInBrowsingCuration');
                var favData = getFavs();
                for (var i = 0; i < favData.length; i++) {
                    if (favData[i] &&
                        favData[i].manifestUrl === manifestUrl &&
                        favData[i].canvasId === canvasId &&
                        favData[i].fragment === fragment &&
                        favData[i].indexInBrowsingCuration === indexInBrowsingCuration) {
                        switchMode('canvasDetail');
                        showCanvasDetail(i, { isFavData: true });
                        break;
                    }
                }
            });
            updateCurationListButtons();
        }
    }
    function setupCurationListEvents() {
        $('#curation_list_ul').on('sortupdate', function(/*event, ui*/) {
            updateCurationListData();
        });
        $('#curation_list_clear').on('click', function() {
            if (storage) {
                removeFavs();
            }
            setupNavigations();
        });
        $('#curation_list_export').on('click', function() {
            if (storage && getCurationJsonExport()) {
                var curationJson = getCurationListJson();
                exportCurationJson(curationJson, {method: 'POST'});
            }
        });
    }
    function updateCurationListButtons() {
        if (storage) {
            var favData = getFavs();
            if (favData.length > 0) {
                $('#curation_descriptive_properties').show();
                $('#curation_list_clear').show();
                if (getCurationJsonExport()) {
                    $('#curation_list_export').show();
                } else {
                    $('#curation_list_export').hide();
                }
            } else {
                $('#curation_descriptive_properties').hide();
                $('#curation_list_clear').hide();
                $('#curation_list_export').hide();
            }
        }
    }
    function updateCurationListData() {
        if (storage) {
            var favData = getFavs();
            var newFavData = [];
            $('#curation_list_ul li').map(function() {
                var $this = $(this);
                var manifestUrl = $this.attr('data-manifestUrl');
                var canvasId = $this.attr('data-canvasId');
                var fragment = $this.attr('data-fragment');
                var indexInBrowsingCuration = $this.attr('data-indexInBrowsingCuration');
                for (var i = 0; i < favData.length; i++) {
                    if (favData[i] &&
                        favData[i].manifestUrl === manifestUrl &&
                        favData[i].canvasId === canvasId &&
                        favData[i].fragment === fragment &&
                        favData[i].indexInBrowsingCuration === indexInBrowsingCuration) {
                        newFavData.push(favData[i]);
                        break;
                    }
                }
            });
            setFavs(newFavData);
        }
    }

    function getCurationListSelections(favData) {
        var selections = [];
        var manifestUrl = '';
        var manifestUrlPrev = '';
        var scRange;
        for (var i = 0; i < favData.length; i++) {
            if (favData[i]) {
                var fav = favData[i];
                manifestUrl = fav.manifestUrl;
                var assumedBaseUrl = manifestUrl.replace(/\/manifest(\.json)?$/i,''); //よくあるパターンのみ対応
                var manifestLabel = fav.manifestLabel;
                var canvasId = fav.canvasId;
                if (fav.fragment) {
                    canvasId += '#' + fav.fragment;
                }
                var canvasIndex = getCursorIndexFromProp(fav.canvasIndex);
                var canvas = {
                    '@id': canvasId,
                    '@type': (canvasIndex !== null) ? 'cs:Canvas' : 'sc:Canvas', //codh:Canvas
                    'label': fav.canvasLabel
                };
                if (canvasIndex !== null) { //timeline
                    canvas.cursorIndex = canvasIndex;
                }
                if (fav.metadata !== undefined) {
                    canvas.metadata = fav.metadata;
                }
                if (manifestUrl !== manifestUrlPrev) {
                    scRange = {
                        '@id': assumedBaseUrl + '/range/r' + String(i + 1),
                        '@type': 'sc:Range',
                        'label': 'Manual curation by IIIF Curation Finder',
                        'members': [canvas],
                        'within': {
                            '@id': manifestUrl,
                            '@type': (canvasIndex !== null) ? 'tl:Manifest' : 'sc:Manifest', //codh:Manifest
                            'label': manifestLabel
                        }
                    };
                    selections.push(scRange);
                    manifestUrlPrev = manifestUrl;
                } else {
                    if (selections.length > 0) {
                        scRange = selections[selections.length - 1];
                        if (scRange && $.isArray(scRange.members)) {
                            scRange.members.push(canvas);
                        }
                    }
                }
            }
        }
        return selections;
    }
    function getCurationJsonFromFavs(favData, properties) {
        var id = 'http://example.org/iiif/curation/curation.json';
        if (!properties) { properties = {}; }
        var label = properties.label || 'Curating list';
        var description = properties.description;
        var selections = getCurationListSelections(favData);
        var codhCuration = {
            '@context': [
                'http://iiif.io/api/presentation/2/context.json',
                CONTEXT_CURATION
            ],
            '@type': 'cr:Curation', //codh:Curation
            '@id': id,
            label: label,
            selections: selections
        };
        if (description) {
            codhCuration.description = description;
        }
        return codhCuration;
    }
    function getCurationListJson() {
        var label = $('#curation_label').val();
        var description = $('#curation_description').val();
        return getCurationJsonFromFavs(getFavs(), { label: label, description: description });
    }
    function exportCurationJson(curationJson, options) {
        var jsonExport = getCurationJsonExport(); //function or url
        if (jsonExport) {
            if ($.isFunction(jsonExport)) {
                jsonExport(curationJson, options);
            } else {
                var curationString = JSON.stringify(curationJson, null, '\t');
                $('<form>').attr({ action: jsonExport, method: 'post', target: '_blank' })
                    .append($('<input>').attr({ type: 'hidden', name: 'curation', value: encodeURIComponent(curationString) }))
                    .append($('<input>').attr({ type: 'hidden', name: 'lang', value: lng }))
                    .appendTo(document.body)
                    .submit()
                    .remove();
            }
        }
    }
    function getCanvasMetadataFromCuration(curation) {
        //curationでCanvasに付与されているmetadataを配列で返す
        var metadataList = [];
        var i, j;
        if ($.isPlainObject(curation)) {
            for (i = 0; i < curation.selections.length; i++) {
                var range = curation.selections[i];
                // http://iiif.io/api/presentation/2.1/#range
                if ($.isPlainObject(range) && range['@type'] === 'sc:Range') {
                    if (range.within) { //withinプロパティ
                        var manifestUrl = '';
                        var timelineUrl = '';
                        var within = range.within;
                        if ($.type(within) === 'string') {
                            manifestUrl = within;
                        } else if ($.isPlainObject(within) && within['@id'] && within['@type'] && $.type(within['@id']) === 'string') {
                            if (within['@type'] === 'sc:Manifest') {
                                manifestUrl = within['@id'];
                            } else if (within['@type'] === 'tl:Manifest' || within['@type'] === 'codh:Manifest') {
                                timelineUrl = within['@id'];
                            }
                        }
                        if (manifestUrl) {
                            if ($.isArray(range.canvases)) { //Rangeのcanvasesプロパティによる表示対象指定
                                for (j = 0; j < range.canvases.length; j++) {
                                    metadataList.push(void 0); //undefined
                                }
                            } else if ($.isArray(range.members)) { //membersプロパティによる表示対象指定
                                //membersプロパティ内では、sc:Canvasのみ対応。membersプロパティ内のsc:Rangeは未対応。
                                for (j = 0; j < range.members.length; j++) {
                                    var member = range.members[j];
                                    if ($.isPlainObject(member)) {
                                        metadataList.push(member.metadata);
                                    }
                                }
                            }
                        } else if (timelineUrl) {
                            if ($.isArray(range.members)) { //membersプロパティによる表示対象指定のみ有効
                                //membersプロパティ内では、sc:Canvasのみ対応。membersプロパティ内のsc:Rangeは未対応。
                                for (j = 0; j < range.members.length; j++) {
                                    var member_ = range.members[j];
                                    if ($.isPlainObject(member_)) {
                                        metadataList.push(member_.metadata);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        return metadataList;
    }

    //----------------------------------------------------------------------
    //IIIF Presentation API関係
    function unescapeLimitedHtmlTag(htmlEscapedString) {
        // http://iiif.io/api/presentation/2.1/#html-markup-in-property-values
        // In order to avoid HTML or script injection attacks, clients must remove:
        //  - All attributes other than href on the a tag, src and alt on the img tag.
        // Clients should allow only a, b, br, i, img, p, and span tags.
        // Clients may choose to remove any and all tags
        // ここでは、aタグとbタグ、brタグ、iタグ、pタグ、spanタグのみ許可する
        function allowHtmlTag(string, tag) {
            var reg1 = new RegExp('&lt;' + tag + '(?:\\s.*?)?&gt;', 'gi');
            var reg2 = new RegExp('&lt;/' + tag + '\\s*&gt;', 'gi');
            return string.replace(reg1, '<' + tag + '>').replace(reg2, '</' + tag + '>');
        }
        function allowHtmlTagVoidElement(string, tag) {
            var reg = new RegExp('&lt;' + tag + '(?:\\s.*?)?/?&gt;', 'gi');
            return string.replace(reg, '<' + tag + '>');
        }
        var reg = new RegExp(/(&lt;a\s.+?&gt;)(.+?)(&lt;\/a\s*&gt;)/gi); //aタグ
        var result = htmlEscapedString.replace(reg,
            function(match, p1, p2, p3 /*, offset, string*/) {
                var result = match;
                if (p1 && p2 && p3) {
                    var hrefUrl = $('<span>').append(p1.replace(/^&lt;/i, '<').replace(/&gt;$/i, '>') + p2 + '</a>').children('a').attr('href');
                    if (hrefUrl) {
                        var anchor = document.createElement('a');
                        anchor.href = hrefUrl;
                        var href = anchor.href;
                        if (/^https?:\/\//.test(href)) {
                            result = $('<a>').attr('href', hrefUrl).html(p2).prop('outerHTML');
                        }
                    }
                }
                return result;
            }
        );
        result = allowHtmlTag(result, 'b');
        result = allowHtmlTag(result, 'i');
        result = allowHtmlTag(result, 'p');
        result = allowHtmlTag(result, 'span');
        result = allowHtmlTagVoidElement(result, 'br');
        return result;
    }
    function getKeyValuesShallow(obj, key) {
        // plain string または key属性値 の配列を返す（浅い探索のみ）
        var result;
        if ($.isArray(obj)) {
            return $.map(obj, function(element) {
                if ($.isPlainObject(element)) {
                    return element[key];
                } else if ($.type(element) === 'string') {
                    return element;
                } else {
                    return null; //elementがArrayの場合は無視
                }
            });
        }
        if ($.isPlainObject(obj)) {
            result = obj[key] || '';
        } else {
            result = obj;
        }
        if ($.type(result) === 'string') {
            return [result];
        } else {
            return []; //入れ子を降りていって探すことはしない
        }
    }
    function getUriRepresentations(prop) {
        // plain string または @id属性値 の配列を返す（format属性による限定はしない）
        // http://iiif.io/api/presentation/2.1/#uri-representation
        // http://iiif.io/api/presentation/2.1/#repeated-properties
        return getKeyValuesShallow(prop, '@id');
    }
    function getPropertyValuesI18n(prop, lang) {
        // @languageを考慮した属性値の配列を返す
        // http://iiif.io/api/presentation/2.1/#language-of-property-values
        // This pattern may be used in label, description, attribution and 
        // the label and value fields of the metadata construction.
        function getElementsI18n(arr, lang) {
            if ($.isArray(arr)) {
                return arr.filter(function(element) {
                    return $.isPlainObject(element) && '@value' in element && (element['@language'] === lang || !lang);
                });
            } else {
                return [];
            }
        }
        var result = prop;
        var key = '@value';
        if ($.isArray(prop)) {
            result = getElementsI18n(prop, lang);
            if (result.length > 0) {
                //言語設定に一致するものがある → 一致したものを表示
            } else {
                var propNum = prop.filter(function(element) {
                    return ($.isPlainObject(element) && key in element) || $.type(element) === 'string';
                }).length;
                var langPropNum = getElementsI18n(prop).length;
                if (langPropNum === 0) {
                    //一つも'@language'が設定されていない → 全て表示
                    result = prop;
                } else if (langPropNum === propNum) {
                    //全ての要素に'@language'が設定されているが、言語設定に一致するものはない
                    //→ 表示すべき言語を決めて、それに一致したものを表示
                    result = getElementsI18n(prop, 'en'); //fallback
                    if (result.length === 0) {
                        result = getElementsI18n(prop);
                        if (result.length > 0) {
                            result = getElementsI18n(prop, result[0]['@language']);
                        }
                    }
                } else {
                    //一部の要素に'@language'が設定されているが、言語設定に一致するものはない
                    //→ '@language'が設定されていないものを全て表示
                    result = prop.filter(function(element) {
                        if ($.isPlainObject(element)) {
                            return !element['@language'];
                        } else if ($.type(element) === 'string') {
                            return element;
                        } else {
                            return false; //elementがArrayの場合は無視
                        }
                    });
                }
            }
        }
        return getKeyValuesShallow(result, key);
    }
    function getPropertyValueI18n(prop, lang) {
        // @languageを考慮した属性値のコンマ区切り文字列を返す
        if (!lang) {
            lang = lng;
        }
        return getPropertyValuesI18n(prop, lang).join(', ');
    }
    function getRegeionFromFragment(fragment) {
        var region = 'full';
        if (fragment) {
            //https://www.w3.org/TR/media-frags/#naming-space
            var match = fragment.match(/xywh=(?:pixel:)?([0-9]+),([0-9]+),([0-9]+),([0-9]+)/); //「percent:」は未対応
            if (match) {
                var x = parseInt(match[1], 10);
                var y = parseInt(match[2], 10);
                var w = parseInt(match[3], 10);
                var h = parseInt(match[4], 10);
                region = [x, y, w, h].join(',');
            }
        }
        return region;
    }
    function getMajorVersionNumberFromSemVer(semVer) {
        var major = parseInt((semVer.split('.'))[0], 10);
        if (isNaN(major)) {
            return -1;
        } else {
            return major;
        }
    }

    //Cursor API関係
    function getCursorEndpointUrlFromCursor(cursor) {
        var cursorEndpointUrl = null;
        if ($.isPlainObject(cursor) && $.isPlainObject(cursor.service)) {
            var service = cursor.service;
            if (service['@context'] && service['@context'] === CONTEXT_CURSOR &&
                service['@id'] && $.type(service['@id']) === 'string') {
                cursorEndpointUrl = service['@id'];
            }
        }
        return cursorEndpointUrl;
    }
    function getCursorUrl(cursorEndpointUrl, cursorIndex) {
        var cursorUrl = null;
        if (cursorEndpointUrl && getCursorIndexFromProp(cursorIndex) !== null) {
            cursorUrl = cursorEndpointUrl;
            cursorUrl += cursorEndpointUrl.indexOf('?') !== -1 ? '&' : '?';
            cursorUrl += 'cursorIndex=' + cursorIndex;
        }
        return cursorUrl;
    }
    function getCursorIndexFromCanvas(canvas) {
        var cursorIndex = null;
        if (!canvas) { return cursorIndex; }
        if ($.isPlainObject(canvas) && canvas['@id'] && canvas['@type']) {
            if ((canvas['@type'] === 'cs:Canvas' || canvas['@type'] === 'codh:Canvas') && 'cursorIndex' in canvas) {
                cursorIndex = getCursorIndexFromProp(canvas.cursorIndex);
            }
        }
        return cursorIndex;
    }
    function getCursorIndexFromProp(prop) {
        var cursorIndex = null;
        if (prop === null || prop === undefined) { return cursorIndex; }
        var match = String(prop).match(/^(-?[0-9]+)$/);
        if (match) {
            cursorIndex = parseInt(match[1], 10);
        }
        return cursorIndex;
    }

    //オブジェクトの最低限の妥当性チェック
    //（この結果がfalseであるものは必ずinvalidだが、この結果がtrueであってもvalidとは限らない）
    function isValidCurationFalseTrue(curation) {
        //最低限のチェック（この結果のみをもってvalidと判断してはならない）
        //selections内の必須プロパティ未チェックなので、この結果のみをもってvalidと判断してはならない
        return ($.isPlainObject(curation) && $.isArray(curation['@context']) &&
            curation['@context'][0] === 'http://iiif.io/api/presentation/2/context.json' &&
            curation['@context'][1] === CONTEXT_CURATION &&
            (curation['@type'] === 'cr:Curation' || curation['@type'] === 'codh:Curation') &&
            $.isArray(curation.selections));
    }
    function isValidManifestFalseTrue(manifest) {
        //最低限のチェック（この結果のみをもってvalidと判断してはならない）
        return ($.isPlainObject(manifest) &&
            manifest['@context'] === 'http://iiif.io/api/presentation/2/context.json' &&
            manifest['@type'] === 'sc:Manifest' &&
            'label' in manifest);
    }
    function isValidTimelineFalseTrue(timeline) {
        //最低限のチェック（この結果のみをもってvalidと判断してはならない）
        return ($.isPlainObject(timeline) && $.isArray(timeline['@context']) &&
            timeline['@context'][0] === 'http://iiif.io/api/presentation/2/context.json' &&
            timeline['@context'][1] === CONTEXT_TIMELINE &&
            (timeline['@type'] === 'tl:Manifest' || timeline['@type'] === 'codh:Manifest') &&
            'label' in timeline &&
            timeline.viewingHint === 'time' &&
            $.isArray(timeline.cursors));
    }
    function isValidCursorFalseTrue(cursor) {
        //最低限のチェック（この結果のみをもってvalidと判断してはならない）
        return ($.isPlainObject(cursor) && $.isArray(cursor['@context']) &&
            cursor['@context'][0] === 'http://iiif.io/api/presentation/2/context.json' &&
            cursor['@context'][1] === CONTEXT_CURSOR &&
            (cursor['@type'] === 'cs:Cursor' || cursor['@type'] === 'codh:Cursor') &&
            getCursorEndpointUrlFromCursor(cursor) && //cursor.serviceのチェック
            $.isPlainObject(cursor.sequence) && $.isArray(cursor.sequence.canvases));
    }
    //URLの妥当性チェック
    function isTrustedUrl(url) {
        var anchor = document.createElement('a');
        anchor.href = url;
        var href = anchor.href;
        for (var i = 0; i < conf.trustedUrlPrefixes.length; i++) {
            var trustedUrlPrefix = conf.trustedUrlPrefixes[i];
            if (trustedUrlPrefix) {
                if (href.indexOf(trustedUrlPrefix) === 0) {
                    return true;
                }
            }
        }
        return false;
    }

    function getRegeion(page) {
        return getRegeionFromFragment(pageInfos[page].fragment);
    }
    function getQuality(page) {
        var semVer = getCanvasImageApiVersion(page);
        var major = getMajorVersionNumberFromSemVer(semVer);
        if (major < 2) {
            return 'native';
        } else {
            return 'default';
        }
    }
    function getThumbnailUrl(page, region, width, height) {
        var complianceLevel = getCanvasImageComplianceLevel(page);
        if (complianceLevel === 0) {
            //Compliance Level 0 の場合は、Sizeにfull以外を指定しての取得は未対応と考える。
            //また、Regionにfull以外を指定しての取得は期待できない上に、
            //Getty Museum のように、/full/full/ では画像を返してくれないサイトもある。
            var thumbnailUrl = getCanvasThumbnailUrl(page);
            if (thumbnailUrl) {
                return thumbnailUrl;
            }
        }
        var canvasImageInfoUrl = getCanvasImageInfoUrl(page);
        var region_ = region || getRegeion(page);
        var w = width || 200;
        var h = height || 200;
        var size;
        if (complianceLevel >= 2) {
            size = '!' + w + ',' + h; //'!200,200';
        } else if (complianceLevel === 1) {
            size = w + ','; //'200,';
        } else if (complianceLevel === 0) {
            size = 'full';
        } else {
            size = '!' + w + ',' + h; //complianceLevel不明
        }
        var rotation = 0;
        var quality = getQuality(page);
        var format = 'jpg';
        var imageReqParams = [region_, size, rotation, quality + '.' + format].join('/');
        return canvasImageInfoUrl.replace('/info.json', '/' + imageReqParams);
    }

    //bookInfos[].canvases[]要素へのアクセスヘルパー
    function getCanvasImageInfoUrl(page) {
        var bookIndex = pageInfos[page].bookIndex;
        var pageLocal = pageInfos[page].pageLocal;
        return bookInfos[bookIndex].canvases[pageLocal - 1].imageInfoUrl; //info.jsonのURL
    }
    function getCanvasId(page) {
        var bookIndex = pageInfos[page].bookIndex;
        var pageLocal = pageInfos[page].pageLocal;
        return bookInfos[bookIndex].canvases[pageLocal - 1].id;
    }
    function getCanvasIds(bookIndex) {
        var canvasIds = [];
        for (var i = 0; i < bookInfos[bookIndex].totalPagesNum; i++) {
            canvasIds.push(bookInfos[bookIndex].canvases[i].id);
        }
        return canvasIds;
    }
    function getCanvasCursorIndex(page) {
        var bookIndex = pageInfos[page].bookIndex;
        var pageLocal = pageInfos[page].pageLocal;
        return bookInfos[bookIndex].canvases[pageLocal - 1].cursorIndex;
    }
    function getCanvasLabel(page) {
        var bookIndex = pageInfos[page].bookIndex;
        var pageLocal = pageInfos[page].pageLocal;
        return bookInfos[bookIndex].canvases[pageLocal - 1].label;
    }
    function getCanvasImageApiVersion(page) {
        var bookIndex = pageInfos[page].bookIndex;
        var pageLocal = pageInfos[page].pageLocal;
        return bookInfos[bookIndex].canvases[pageLocal - 1].imageApiVersion;
    }
    function getCanvasImageComplianceLevel(page) {
        var bookIndex = pageInfos[page].bookIndex;
        var pageLocal = pageInfos[page].pageLocal;
        return bookInfos[bookIndex].canvases[pageLocal - 1].imageComplianceLevel;
    }
    function getCanvasThumbnailUrl(page) {
        var bookIndex = pageInfos[page].bookIndex;
        var pageLocal = pageInfos[page].pageLocal;
        return bookInfos[bookIndex].canvases[pageLocal - 1].thumbnail; //undefinedもありうる
    }
    function getCanvasMetadata(page) {
        var result;
        if (getBrowsingCurationUrl()) {
            var metadata = getCanvasMetadataFromCuration(getBrowsingCurationJson());
            if (metadata.length === pageInfos.length) {
                result = metadata[page];
            }
        }
        return result;
    }

    //getter/setter
    function getLang() {
        return lng;
    }
    function getBrowsingCurationJson() {
        return curationInfo.curation || {};
    }
    function getBrowsingCurationUrl() {
        return curationInfo.curationUrl || '';
    }
    function getCurationJsonExportUrl() {
        return conf.service.curationJsonExportUrl || '';
    }
    function getCurationJsonExport() {
        return conf.service.curationJsonExport;
    }
    function setCurationJsonExport(arg) { //arg: callback function or url or null
        if ($.isFunction(arg)) {
            conf.service.curationJsonExport = arg;
        } else if ($.type(arg) === 'string') {
            conf.service.curationJsonExport = arg;
            conf.service.curationJsonExportUrl = arg;
        } else {
            conf.service.curationJsonExport = '';
        }
    }
    return {
        getLang: getLang, //'en' or 'ja'
        getBrowsingCurationUrl: getBrowsingCurationUrl,   //現在表示している外部curationのURLを取得
        getCurationJsonExportUrl: getCurationJsonExportUrl,
        setCurationJsonExport: setCurationJsonExport
    };
};
