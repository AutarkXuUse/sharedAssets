#!/bin/bash
composer archive create -t dir -n .&&composer network update -a shared-assets-composer\@0.0.1.bna -c admin@shared-assets-composer && composer-rest-server -c admin@shared-assets-composer -n always -w true
