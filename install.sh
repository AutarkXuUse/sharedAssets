#!/bin/bash
composer archive create -t dir -n .
composer network install --card PeerAdmin@hlfv1 --archiveFile shared-assets-composer@0.0.1.bna
composer network start --networkName shared-assets-composer --networkVersion 0.0.1 --networkAdmin admin --networkAdminEnrollSecret adminpw --card PeerAdmin@hlfv1 --file networkadmin.card&&composer-rest-server
