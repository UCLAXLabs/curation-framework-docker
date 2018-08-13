#!/bin/bash

cic=`docker ps -a -q -f name=curation-framework-docker_canvasindexer_1`
jkc=`docker ps -a -q -f name=curation-framework-docker_jsonkeeper_1`
cvc=`docker ps -a -q -f name=curation-framework-docker_curationviewer_1`
cfc=`docker ps -a -q -f name=curation-framework-docker_curationfinder_1`
ce=`docker ps -a -q -f name=curation-framework-docker_curationeditor_1`
cm=`docker ps -a -q -f name=curation-framework-docker_curationmanager_1`
lc=`docker ps -a -q -f name=curation-framework-docker_loris_1`
if [ ! -z "$cic" -a "$cic" != "" ]; then
    docker container rm "$cic"
fi
if [ ! -z "$jkc" -a "$jkc" != "" ]; then
    docker container rm "$jkc"
fi
if [ ! -z "$cvc" -a "$cvc" != "" ]; then
    docker container rm "$cvc"
fi
if [ ! -z "$cfc" -a "$cfc" != "" ]; then
    docker container rm "$cfc"
fi
if [ ! -z "$ce" -a "$ce" != "" ]; then
    docker container rm "$ce"
fi
if [ ! -z "$cm" -a "$cm" != "" ]; then
    docker container rm "$cm"
fi
if [ ! -z "$lc" -a "$lc" != "" ]; then
    docker container rm "$lc"
fi
