'use strict';

var DEBUG_STAND_ALONE_NOT_BIND=true;
var TOKEN_RATE=0.005;

//验证participant类型
var validateParticipantType=function(currentParticipant,targetParticipanType){
    if(currentParticipant.getFullyQualifiedType()!= targetParticipanType)
    {
        return false;
    }
    return true;
}

//验证participant ID
var valiadteParticipantID=function(currentParticipant,targetParticipanID){
    if(currentParticipant.getFullyQualifiedIdentifier()!=targetParticipanID)
    {
        return false;
    }
    return true;
}

//实例化Token流水
var getTokenFlowRespurce=function(org,amount,isAdd,balanceChangeReason,changeToken){
    var factory=getFactory();

    var now=new Date();
    var assetID="TF"+now.getTime().toString()+Math.floor(Math.random()*100+100);
    var assetResource=factory.newResource("sharedAssets","TokenFlow",assetID);
    assetResource.partyID=org.getIdentifier();
    assetResource.involvedCreditorOrg=org;
    assetResource.amount=amount;
    assetResource.isAdd=isAdd;
    assetResource.balanceChangeReason=balanceChangeReason;
    assetResource.time=now;
    assetResource.balance=changeToken;
    return assetResource;
}

//Token流水
var addTokenFlow=function(org,amount,isAdd,balanceChangeReason){

    var factory=getFactory();

    var now=new Date();
    var assetID=org.getIdentifier()+"_"+now.getTime().toString()+"_"+Math.floor(Math.random()*100+100);
    var assetResource=factory.newResource("sharedAssets","TokenFlow",assetID);
    assetResource.partyID=org.getIdentifier();
    assetResource.involvedCreditorOrg=org;
    assetResource.amount=amount;
    assetResource.isAdd=isAdd;
    assetResource.balanceChangeReason=balanceChangeReason;
    assetResource.time=now;

    return getParticipantRegistry("sharedAssets.InvolvedCreditorOrg")
        .then(function(participantRegistry){
            return participantRegistry.get(org.getIdentifier());
        })
        .then(function(orgResource){
            assetResource.balance=orgResource.balance;
            return getAssetRegistry("sharedAssets.TokenFlow");
        })
        .then(function(assetRegistry){
            assetRegistry.add(assetResource);
        });
}

//验证资产所有者
var valiadteAssetOwner=function(currentParticipant,assetResouce){
    if(currentParticipant.getFullyQualifiedIdentifier()!=assetResouce.involvedCreditorOrg.getFullyQualifiedIdentifier())
    {
        return false;
    }
    return true;
}

//规范资产字段-(资产上链交易)
var specificationLoanSharedPlan=function(loanSharedPlanInstance,currentParticipant){
        loanSharedPlanInstance.status="CLAIMABLE";
        loanSharedPlanInstance.loanShareConfirms=[];
        if(!DEBUG_STAND_ALONE_NOT_BIND){
            loanSharedPlanInstance.contributeOrg=currentParticipant;
        }
        return loanSharedPlanInstance;
}

//检查重复收纳行为-（收纳交易）
var valiadteRepeatConfirm=function(loanSharedPlanInstance,participantInfo){
    var isRepeated=false;
    loanSharedPlanInstance.loanShareConfirms.forEach(function(confirmedInfo){
        if(confirmedInfo.partyID==participantInfo.partyID){
            isRepeated=true;
        }
    })
    return isRepeated;
}

//根据用户贡献值排序
var sortParticipantByContributionValue=function(arr,isFirst){
    arr.sort(function(a,b){
        if(isFirst){
            return a["confirmTime"].valueOf()-b["confirmTime"].valueOf();
        }else{
            if(a["currentContributionValue"]==b["currentContributionValue"]){
                return a["confirmTime"].valueOf()-b["confirmTime"].valueOf();
            }else{
                return b["currentContributionValue"]-a["currentContributionValue"]
            }
        }
    })
    console.log
    return arr;
}

//资产收纳分配方案1-业务方提出于：2018-03-22
var generateDistributePlan=function(loanSharedPlanInstance,isFirst){
    var factory=new getFactory();

    var allTakeInLimit=0;
    var loanSharedConfirms;
    loanSharedPlanInstance.report=[];

    //根据贡献值将对象数组排序
    loanShareConfirms=sortParticipantByContributionValue(loanSharedPlanInstance.loanShareConfirms,isFirst);

    for(var x in loanShareConfirms){

        allTakeInLimit += loanShareConfirms[x].confirmTakeInLimit;
        var compeletedLoanSharedPlanReport=factory.newConcept("assetsLoan","CompeletedLoanSharedPlanReport");

        if(allTakeInLimit<loanSharedPlanInstance.joinLimit.sharedUpLimit){
            compeletedLoanSharedPlanReport.partyID=loanShareConfirms[x].partyID;
            compeletedLoanSharedPlanReport.partyName=loanShareConfirms[x].partyName;
            compeletedLoanSharedPlanReport.limit=loanShareConfirms[x].confirmTakeInLimit;
            compeletedLoanSharedPlanReport.token=loanShareConfirms[x].token;

            loanSharedPlanInstance.report.push(compeletedLoanSharedPlanReport);
        }else{
            compeletedLoanSharedPlanReport.partyID=loanShareConfirms[x].partyID;
            compeletedLoanSharedPlanReport.partyName=loanShareConfirms[x].partyName;
            compeletedLoanSharedPlanReport.limit=loanSharedPlanInstance.joinLimit.sharedUpLimit-allTakeInLimit+loanShareConfirms[x].confirmTakeInLimit;
            compeletedLoanSharedPlanReport.token=compeletedLoanSharedPlanReport.limit*TOKEN_RATE;

            loanSharedPlanInstance.report.push(compeletedLoanSharedPlanReport);
            break;
        }
    }

    return loanSharedPlanInstance;
}

//更新用户token、贡献值信息
var updateParticipantBusinessInfo=function(partyID,token,contribute,frozenToken,loanSharedPlanID,isAdd,balanceChangeReason){
    var orgRegistry;
    return getParticipantRegistry("sharedAssets.InvolvedCreditorOrg")
        .then(function(registry){
            orgRegistry=registry;
            return registry.get(partyID);
        })
        .then(function(targetOrg){
            targetOrg.balance += token;
            targetOrg.contributionValue += contribute;
            targetOrg.frozenToken -= frozenToken;

            return orgRegistry.update(targetOrg);
        })
}

//交易完成-参与者TOKEN、贡献值处理
var processPartipantValues=function(finishedAssets){

    var promises=[];
    var tokenFlows=[];
    finishedAssets.forEach(function(finishedAsset){

        //贡献机构处理
        var transferIDs=[];
        var contributeGet=0;
        var tokenBack=0;
        var payment=0;

        finishedAsset.report.forEach(function(reportIns){
            transferIDs.push(reportIns.partyID); //参与收纳者们的id
            contributeGet += reportIns.limit; //贡献值获得的贡献值
            //tokenGet += reportIns.token; //贡献者获得的Token
            payment += reportIns.token; //贡献者需要缴纳的Token

        })

        tokenBack=finishedAsset.joinLimit.sharedUpLimit*TOKEN_RATE-payment;

        var contributePromiseObj=new Promise(function(resolve,reject){
            updateParticipantBusinessInfo(finishedAsset.contributeOrg.getIdentifier(),tokenBack,contributeGet,payment,finishedAsset.assetID)
                .then(function(){
                    resolve();
                })
                .catch(function(err){
                    reject(err);
                })
        })
        promises.push(contributePromiseObj);//贡献机构余额及贡献值信息变更

        //实例化流水资源
        var contributeTokenFlow=getTokenFlowRespurce(finishedAsset.contributeOrg,tokenGet,true,"CONTRIBUTION_INCOME",0);
        tokenFlows.push(contributeTokenFlow);

        finishedAsset.loanShareConfirms.forEach(function(loanShareConfirm){
            var idInReport=transferIDs.indexOf(loanShareConfirm.partyID);

            var changeContribute;
            var changeFrozenToken;
            var changeToken;
            var thisPartyID=loanShareConfirm.partyID;

            if(idInReport>-1){ //参与成功的机构
                 changeContribute = finishedAsset.report[idInReport].limit;
                 changeFrozenToken = loanShareConfirm.token;
                 changeToken = loanShareConfirm.token-finishedAsset.report[idInReport].token;
            }else{ //参与失败的机构
                 changeContribute = 0;
                 changeFrozenToken = loanShareConfirm.token;
                 changeToken = loanShareConfirm.token;

            }

            if(changeContribute){
                var confirmTokenFlow = getTokenFlowRespurce(loanShareConfirm.confirmedOrg,finishedAsset.report[idInReport].token,false,"STORAGE_PAY",loanShareConfirm.token);
                 tokenFlows.push(confirmTokenFlow);
            }

            var confirmPromiseObj =new Promise(function(resolve,reject){
                updateParticipantBusinessInfo(thisPartyID,changeToken,changeContribute,changeFrozenToken,finishedAsset.assetID)
                    .then(function(){
                        resolve();
                    })
                    .catch(function(err){
                        reject(err);
                    })
            })

            promises.push(confirmPromiseObj);//确认机构余额及贡献值变更信息
        })
    })

    return getParticipantRegistry("sharedAssets.InvolvedCreditorOrg")
        .then(function(participantRegistry){
            return participantRegistry.getAll();
        })
        .then(function(participants){
            participants.forEach(function(participant){
                tokenFlows.forEach(function(tokenFlow){
                    if(tokenFlow.partyID==participant.partyID){
                        if(tokenFlow.isAdd){
                            tokenFlow.balance=participant.balance+tokenFlow.amount;
                            //throw new Error(tokenFlow.balance+"  "+participant.balance+"  "+tokenFlow.amount);
                        }
                        else{
                            tokenFlow.balance=participant.balance+tokenFlow.balance-tokenFlow.amount;
                        }
                    }
                })
            })
            //throw new Error(tokenFlows[0].balance+" "+tokenFlows[0].partyID);
            return getAssetRegistry("sharedAssets.TokenFlow");
        })
        .then(function(assetRegistry){
            return assetRegistry.addAll(tokenFlows);
        })
        .then(function(){
            return Promise.all(promises);
        })
}

/**
 * 上链交易
 * @param {sharedAssets.putLoanSharedPlan} putLoanSharedPlanTX
 * @transaction
 */
 function onPutLoanSharedPlan(putLoanSharedPlanTX){

    var currentParticipant=getCurrentParticipant();
    var standardLoanSharedPlan=specificationLoanSharedPlan(putLoanSharedPlanTX.loanSharedPlan,currentParticipant);

    var targetParticipant;
    if(DEBUG_STAND_ALONE_NOT_BIND){
        targetParticipant=standardLoanSharedPlan.contributeOrg;
    }else{
        targetParticipant=currentParticipant;
        if(!validateParticipantType(currentParticipant,"sharedAssets.InvolvedCreditorOrg")){
            throw new Error("Participant Type Error: " + currentParticipant.getFullyQualifiedIdentifier());
        }
    }

    var loanSharedPlanAssetRegistry;
    var factory=getFactory();
    return getAssetRegistry("sharedAssets.LoanSharedPlan")
        .then(function(assetRegistry){
                loanSharedPlanAssetRegistry=assetRegistry;
                return loanSharedPlanAssetRegistry.exists(standardLoanSharedPlan.assetID);
        })
        .then(function(exist){
            if(exist){
                throw new Error('Exist LoanSharedPlan');
            }
            var assetResource=factory.newResource("sharedAssets","LoanSharedPlan",standardLoanSharedPlan.assetID);
            assetResource=standardLoanSharedPlan;
            assetResource.onTheChainTime=new Date();
            assetResource.riskResults=[];
            return loanSharedPlanAssetRegistry.add(assetResource);
        })
        .then(function(){
            var compeleteEvent=factory.newEvent("sharedAssets","PutLoanSharedPlanEvent");
            compeleteEvent.loanSharedPlan=standardLoanSharedPlan;
            emit(compeleteEvent);
            return getParticipantRegistry("sharedAssets.InvolvedCreditorOrg");
        })
        .then(function(participantRegistry){
            targetParticipant.balance -= standardLoanSharedPlan.joinLimit.sharedUpLimit*TOKEN_RATE;
            targetParticipant.frozenToken += standardLoanSharedPlan.joinLimit.sharedUpLimit*TOKEN_RATE;
            return participantRegistry.update(targetParticipant);
        })
 }

 /**
  * 撤回资产
  * @param {sharedAssets.revokedLoanAsset} revokedLoanAssetTX
  * @transaction
  */
 function onRevokedLoanAsset(revokedLoanAssetTX){
    var currentParticipant=getCurrentParticipant();
    var targetLoanSharedPlan=revokedLoanAssetTX.loanSharedPlan;
    
    if(DEBUG_STAND_ALONE_NOT_BIND){
        
    }else{
        if(!valiadteAssetOwner(currentParticipant,targetLoanSharedPlan)){
            throw new Error("Asset Owner Error: "+currentParticipant);
        }
    }

    if(targetLoanSharedPlan.status!="CLAIMABLE"){
        throw new Error("Asset is confirmed by someone");
    }

    targetLoanSharedPlan.status="REVOKED";
    var factory=getFactory();

    return getAssetRegistry("sharedAssets.LoanSharedPlan")
        .then(function(loanSharedPlanRegistry){
            loanSharedPlanRegistry.update(targetLoanSharedPlan);
        })
        .then(function(){
            var eventResource=factory.newEvent("sharedAssets","RevokedLoanAssetEvent");
            eventResource.loanSharedPlan=targetLoanSharedPlan;
            emit(eventResource);
        })
 }

 /**
  * 收纳交易
  * @param {sharedAssets.orgConfirmAsset} orgConfirmAssetTX
  * @transaction
  */
 function onOrgConfirmAsset(orgConfirmAssetTX){
    var currentParticipant=getCurrentParticipant();
    var factory=getFactory();

    var targetLoanSharedPlan=orgConfirmAssetTX.loanSharedPlan;
    var paticipantInfo;
    if(DEBUG_STAND_ALONE_NOT_BIND){
        paticipantInfo=orgConfirmAssetTX.involvedCreditorOrg;
    }else if(!currentParticipant){
        if(!validateParticipantType(currentParticipant,"sharedAssets.InvolvedCreditorOrg")){
            throw new Error("Participant Type Error: " + currentParticipant.getFullyQualifiedIdentifier());
        }
        paticipantInfo=currentParticipant;
    }else{
        throw new Error("transaction needs a participant");
    }

    var targetLoanSharedPlan=orgConfirmAssetTX.loanSharedPlan;
    var paticipantInfo=orgConfirmAssetTX.involvedCreditorOrg;

    //检查资产时间戳、资产状态、参与人数、重复收纳行为
    if(targetLoanSharedPlan.joinLimit.endTime.valueOf()<Date.now()){
        throw new Error("Join limit:endTime");
    }else if(targetLoanSharedPlan.status=="FINISHED"||targetLoanSharedPlan.status=="REVIKED"){
        throw new Error("Status not storagable");
    }else if(targetLoanSharedPlan.loanShareConfirms.length>=targetLoanSharedPlan.joinLimit.participantsUpLimit){
        throw new Error("Join limit:participantsUpLimit");
    }else if(valiadteRepeatConfirm(targetLoanSharedPlan,paticipantInfo)){
        throw new Error("Already confirmed");
    }else if(targetLoanSharedPlan.contributeOrg.getIdentifier()==paticipantInfo.getIdentifier()){
        throw new Error("can'n storage your own share");
    }

    //更新引用对象资产信息、更新余额信息
    orgConfirmAssetTX.loanShareConfirm.confirmTime=new Date();
    orgConfirmAssetTX.loanShareConfirm.confirmedOrg=paticipantInfo;
    orgConfirmAssetTX.loanShareConfirm.partyID=paticipantInfo.partyID;
    orgConfirmAssetTX.loanShareConfirm.partyName=paticipantInfo.partyName;
    orgConfirmAssetTX.loanShareConfirm.currentContributionValue=paticipantInfo.contributionValue;
    orgConfirmAssetTX.loanShareConfirm.token=orgConfirmAssetTX.loanShareConfirm.confirmTakeInLimit*TOKEN_RATE;

    throw new Error(TOKEN_RATE+" | "+orgConfirmAssetTX.loanShareConfirm.token);

    if(orgConfirmAssetTX.loanShareConfirm.token>paticipantInfo.balance){
        throw new Error("Not enough balance");
    }
    if(orgConfirmAssetTX.loanShareConfirm.confirmTakeInRate>targetLoanSharedPlan.joinLimit.sharedRateUpLimit||orgConfirmAssetTX.loanShareConfirm.confirmTakeInRate<targetLoanSharedPlan.joinLimit.sharedRateLowerLimit){
        throw new Error("Not supported rate");
    }
    if(orgConfirmAssetTX.loanShareConfirm.confirmTakeInLimit>targetLoanSharedPlan.joinLimit.sharedUpLimit || orgConfirmAssetTX.loanShareConfirm.confirmTakeInLimit<10000){
        throw new Error("confirmTakeInLimit should be more than 10000 and not beyond sharedUpLimit");
    }
    targetLoanSharedPlan.loanShareConfirms.push(orgConfirmAssetTX.loanShareConfirm);
    if(targetLoanSharedPlan.loanShareConfirms.length==targetLoanSharedPlan.joinLimit.participantsUpLimit){
        targetLoanSharedPlan.status="PROCESSING";
    }
    paticipantInfo.balance -= orgConfirmAssetTX.loanShareConfirm.token;
    paticipantInfo.frozenToken += orgConfirmAssetTX.loanShareConfirm.token;
    
    //更新仓库-发布事件
    return getAssetRegistry("sharedAssets.LoanSharedPlan")
        .then(function(loanSharedPlanRegistry){
            loanSharedPlanRegistry.update(targetLoanSharedPlan);
            return getParticipantRegistry("sharedAssets.InvolvedCreditorOrg");
        })
        .then(function(involvedCreditorOrgRegistry){
            return involvedCreditorOrgRegistry.update(paticipantInfo);
        })
        .then(function(){
            var eventResource=factory.newEvent("sharedAssets","OrgConfirmAssetEvent");
            eventResource.loanSharedPlan=targetLoanSharedPlan;
            eventResource.involvedCreditorOrg=paticipantInfo;
            emit(eventResource);
        })

 }

 /**
  * 检查资产状态
  * @param {sharedAssets.checkAssetsStatus} checkAssetsStatusTX
  * @transaction
  */
 function onCheckAssetsStatus(checkAssetsStatusTX){

    var factory=getFactory();
    var eventResource=factory.newEvent("sharedAssets","CheckAssetsStatusEvent");
    eventResource.finishSharedAssets=[];

    var assetRegitstry;
     return getAssetRegistry("sharedAssets.LoanSharedPlan")
        .then(function(loanSharedPlanRegistry){
            assetRegitstry=loanSharedPlanRegistry;
            return assetRegitstry.getAll();
        })
        .then(function(loanSharedPlans){
            var isFirst=false;
            if(loanSharedPlans.length<2){
                isFirst=true;
            }

            loanSharedPlans.forEach(function(loanSharedPlan){

                if(loanSharedPlan.status!="FINISHED"&&loanSharedPlan.status!="REVOKED"){
                    if(loanSharedPlan.joinLimit.endTime.valueOf()<Date.now()||loanSharedPlan.status=="PROCESSING"){
                        var processedLoanSharedPlan=generateDistributePlan(loanSharedPlan,isFirst);
                        processedLoanSharedPlan.status="FINISHED";
                        eventResource.finishSharedAssets.push(processedLoanSharedPlan);
                    }
                }
            })
            return assetRegitstry.updateAll(eventResource.finishSharedAssets);
        })
        .then(function(){
            return processPartipantValues(eventResource.finishSharedAssets);
        })
        .then(function(resultArr){
            emit(eventResource);
        })
        .catch(function(err){
            throw new Error(err);
        })
 }

 /**
  * 更新公钥
  * @param {sharedAssets.updatePublicKey} updatePublicKeyTX
  * @transaction
  */
function onUpdatePublicKey(updatePublicKeyTX){
    var currentParticipant=getCurrentParticipant();
    var factory=getFactory();

    var targetParticipant;
    if(DEBUG_STAND_ALONE_NOT_BIND){
        targetParticipant=updatePublicKeyTX.involvedCreditorOrg;
    }else if(!currentParticipant){
        targetParticipant=currentParticipant;
    }else{
        throw new Error("transaction needs a participant");
    }
    targetParticipant.publicKey=updatePublicKeyTX.newPublicKey;
    
    return getParticipantRegistry("sharedAssets.InvolvedCreditorOrg")
        .then(function(paticipantRegistry){
            paticipantRegistry.update(targetParticipant);
        })
        .then(function(){
            var eventResource=factory.newEvent("sharedAssets","UpdatePublicKeyEvent");
            eventResource.involvedCreditorOrg=targetParticipant;
            emit(eventResource);
        })
    
}

/**
  * 上传风控结果
  * @param {sharedAssets.putRiskResult} putRiskResultTX
  * @transaction
  */
 function onPutRiskResult(putRiskResultTX){
    var currentParticipant=getCurrentParticipant();
    var factory=getFactory();

    var targetParticipant;
    if(DEBUG_STAND_ALONE_NOT_BIND){
        targetParticipant=putRiskResultTX.putOrg;
    }else if(!currentParticipant){
        targetParticipant=currentParticipant;
    }else{
        throw new Error("transaction needs a participant");
    }

    var targetLoanSharedPlan=putRiskResultTX.loanSharedPlan;
    putRiskResultTX.partyID=putRiskResultTX.putOrg.getIdentifier();

    targetLoanSharedPlan.riskResults.forEach(function(risk){
        if(risk.partyID==putRiskResultTX.partyID){
            throw new Error("already put ,partyID: "+risk.partyID);
        }
    })

    var riskResult=factory.newConcept("assetsLoan","RiskResult");
    riskResult.putOrg=putRiskResultTX.putOrg;
    riskResult.partyID=putRiskResultTX.partyID;
    riskResult.risk=putRiskResultTX.risk;

    targetLoanSharedPlan.riskResults.push(riskResult);
    
    return getAssetRegistry("sharedAssets.LoanSharedPlan")
        .then(function(assetRegistry){
            assetRegistry.update(targetLoanSharedPlan);
        })
        .then(function(){
            var eventResource=factory.newEvent("sharedAssets","PutRiskResultEvent");
            eventResource.loanSharedPlan=targetLoanSharedPlan;
            emit(eventResource);
        })
    
}


