define([
    'ash',
    'game/GlobalSignals',
    'game/constants/UIConstants',
    'game/constants/ItemConstants',
    'game/constants/PlayerStatConstants',
    'game/constants/PlayerActionConstants',
    'game/nodes/PlayerLocationNode',
    'game/nodes/player/PlayerStatsNode',
    'game/nodes/player/AutoPlayNode',
    'game/nodes/sector/CampNode',
    'game/nodes/NearestCampNode',
    'game/components/common/CampComponent',
    'game/components/common/PositionComponent',
    'game/components/player/ItemsComponent',
    'game/components/sector/improvements/SectorImprovementsComponent'
], function (Ash,
    GlobalSignals,
    UIConstants,
    ItemConstants,
    PlayerStatConstants,
	PlayerActionConstants,
	PlayerLocationNode,
	PlayerStatsNode,
	AutoPlayNode,
	CampNode,
	NearestCampNode,
	CampComponent,
	PositionComponent,
	ItemsComponent,
    SectorImprovementsComponent
) {
    var UIOutElementsSystem = Ash.System.extend({
	
        currentLocationNodes: null,
        campNodes: null,
        nearestCampNodes: null,
		playerStatsNodes: null,
		autoPlayNodes: null,
        
        gameState: null,
        playerActions: null,
        uiFunctions: null,
        resourcesHelper: null,
        buttonHelper: null,
        engine: null,
		
        elementsCalloutContainers: null,
        elementsVisibleButtons: [],
        elementsVisibleProgressbars: [],
    
        constructor: function (uiFunctions, gameState, playerActions, resourcesHelper, fightHelper, buttonHelper) {
            this.gameState = gameState;
            this.playerActions = playerActions;
            this.uiFunctions = uiFunctions;
            this.resourcesHelper = resourcesHelper;
            this.fightHelper = fightHelper;
            this.buttonHelper = buttonHelper;            
            return this;
        },
    
        addToEngine: function (engine) {
            this.engine = engine;
            this.currentLocationNodes = engine.getNodeList(PlayerLocationNode);
            this.campNodes = engine.getNodeList(CampNode);
            this.nearestCampNodes = engine.getNodeList(NearestCampNode);
			this.playerStatsNodes = engine.getNodeList(PlayerStatsNode);
			this.autoPlayNodes = engine.getNodeList(AutoPlayNode);
            
            this.campNodes.nodeAdded.add(this.onCampNodeAdded, this);
            this.campNodes.nodeRemoved.add(this.onCampNodeRemoved, this);
            
            this.refreshSavedElements();
            GlobalSignals.calloutsGeneratedSignal.add(this.refreshSavedElements);
            this.updateTabVisibility();
            
            var sys = this;
            GlobalSignals.calloutsGeneratedSignal.add(function () { sys.updateTabVisibility(); });
            GlobalSignals.improvementBuiltSignal.add(function () { sys.updateTabVisibility(); });
            GlobalSignals.featureUnlockedSignal.add(function () { sys.updateTabVisibility(); });
            GlobalSignals.playerMovedSignal.add(function () { sys.updateTabVisibility(); });
            GlobalSignals.gameShownSignal.add(function () { sys.updateTabVisibility(); });
            GlobalSignals.elementToggledSignal.add(function () { sys.elementsVisibilityChanged = true; });
            GlobalSignals.elementCreatedSignal.add(function () { sys.elementsVisibilityChanged = true; });
        },
    
        removeFromEngine: function (engine) {
            this.engine = null;
            this.currentLocationNodes = null;
            this.campNodes = null;
            this.nearestCampNodes = null;
			this.autoPlayNodes = null;
        },
        
        onCampNodeAdded: function (node) {
            this.updateTabVisibility();
        },
        
        onCampNodeRemoved: function (node) {
            this.updateTabVisibility();
        },
    
        update: function (time) {
            if (this.elementsVisibilityChanged) {
                this.updateVisibleButtonsList();
                this.updateVisibleProgressbarsList();
                this.elementsVisibilityChanged = false;
            }
            
            this.updateButtons();
            this.updateProgressbars();
            this.updateTabs();
            this.updateInfoCallouts();
        },
        
        refreshSavedElements: function () {            
            this.elementsCalloutContainers = $(".callout-container");
        },
        
        updateButtons: function () {
            var sys = this;            
            var uiFunctions = this.uiFunctions;
            
            for (var i = 0; i < this.elementsVisibleButtons.length; i++) {
                var $button = $(this.elementsVisibleButtons[i]);                
                var action = $button.attr("action");
                if (!action)
                    return;

                var isHardDisabled = sys.updateButtonDisabledState($button, action);
				sys.updateButtonCallout($button, action, isHardDisabled);
            }
        },
        
        updateButtonDisabledState: function (button, action) {
            var $button = $(button);
			var isAutoPlaying = this.autoPlayNodes.head;
            var disabledBase = this.isButtonDisabled($(button));
            var disabledVision = this.isButtonDisabledVision($(button));
            var disabledBasic = !disabledVision && disabledBase;
            var disabledResources = !disabledVision && !disabledBasic && this.isButtonDisabledResources($button);
            var disabledCooldown = !disabledVision && !disabledBasic && !disabledResources && this.hasButtonCooldown($button);
            var disabledDuration = !disabledVision && !disabledBasic && !disabledResources && !disabledCooldown && this.hasButtonDuration($button);
            var isDisabled = disabledBasic || disabledVision || disabledResources || disabledCooldown || disabledDuration;
            $(button).toggleClass("btn-disabled", isDisabled);
            $(button).toggleClass("btn-disabled-basic", disabledBasic);
            $(button).toggleClass("btn-disabled-vision", disabledVision);
            $(button).parent(".container-btn-action").toggleClass("btn-disabled-vision", disabledVision);
            $(button).toggleClass("btn-disabled-resources", disabledResources);
            $(button).toggleClass("btn-disabled-cooldown", disabledCooldown || disabledDuration);
            $(button).attr("disabled", isDisabled || isAutoPlaying);
            return disabledBase || disabledVision;
        },
        
        updateButtonCallout: function ($button, action, isHardDisabled) {
            var $callout = $($button.parent().siblings(".btn-callout").children(".btn-callout-content"));
            var $enabledContent = $($callout.children(".btn-callout-content-enabled"));
            var $disabledContent = $($callout.children(".btn-callout-content-disabled"));

            var playerActionsHelper = this.playerActions.playerActionsHelper;
            var fightHelper = this.fightHelper;
            var buttonHelper = this.buttonHelper;
            
            var playerVision = this.playerStatsNodes.head.vision.value;
            var playerHealth = this.playerStatsNodes.head.stamina.health;
            var showStorage = this.resourcesHelper.getCurrentStorageCap();
            
            var baseActionId = playerActionsHelper.getBaseActionID(action);
            var ordinal = playerActionsHelper.getOrdinal(action);
            var costFactor = playerActionsHelper.getCostFactor(action);
            var costs = playerActionsHelper.getCosts(action, ordinal, costFactor);
            var hasCostBlockers = false;

            // Update callout content
            var bottleNeckCostFraction = 1;
            var sectorEntity = buttonHelper.getButtonSectorEntity($button);
            var disabledReason = playerActionsHelper.checkRequirements(action, false, sectorEntity).reason;
            var isDisabledOnlyForCooldown = (!(disabledReason) && this.hasButtonCooldown($button));
            if (!isHardDisabled || isDisabledOnlyForCooldown) {
                this.uiFunctions.toggle($enabledContent, true);
                this.uiFunctions.toggle($disabledContent, false);
                var hasCosts = action && costs && Object.keys(costs).length > 0;
                if (hasCosts) {
                    for (var key in costs) {
                        var $costSpan = $($enabledContent.children(".action-cost-" + key));
                        var value = costs[key];
                        var costFraction = playerActionsHelper.checkCost(action, key);
                        var isFullCostBlocker = (isResource(key.split("_")[1]) && value > showStorage) || (key == "stamina" && value > playerHealth * PlayerStatConstants.HEALTH_TO_STAMINA_FACTOR);
                        if (isFullCostBlocker) {
                            hasCostBlockers = true;
                        }
                        else if (costFraction < bottleNeckCostFraction)  {
                            bottleNeckCostFraction = costFraction;
                        }
                        $costSpan.toggleClass("action-cost-blocker", costFraction < 1);
                        $costSpan.toggleClass("action-cost-blocker-storage", isFullCostBlocker);
                    }
                }

                var hasEnemies = fightHelper.hasEnemiesCurrentLocation(action);
                var injuryRisk = PlayerActionConstants.getInjuryProbability(action, playerVision);
                var injuryRiskBase = injuryRisk > 0 ? PlayerActionConstants.getInjuryProbability(action) : 0;
                var injuryRiskVision = injuryRisk - injuryRiskBase;
                var inventoryRisk = PlayerActionConstants.getLoseInventoryProbability(action, playerVision);
                var inventoryRiskBase = inventoryRisk > 0 ? PlayerActionConstants.getLoseInventoryProbability(action) : 0;
                var inventoryRiskVision = inventoryRisk - inventoryRiskBase;
                var fightRisk = hasEnemies ? PlayerActionConstants.getRandomEncounterProbability(baseActionId, playerVision) : 0;
                var fightRiskBase = fightRisk > 0 ? PlayerActionConstants.getRandomEncounterProbability(baseActionId) : 0;
                var fightRiskVision = fightRisk - fightRiskBase;
                if (injuryRisk > 0 || fightRisk > 0 || inventoryRisk > 0) {
                    this.uiFunctions.toggle($enabledContent.children(".action-risk-injury"), injuryRisk > 0);
                    if (injuryRisk > 0) 
                        $enabledContent.children(".action-risk-injury").children(".action-risk-value").text(UIConstants.roundValue((injuryRiskBase + injuryRiskVision) * 100, true, true));
                    
                    this.uiFunctions.toggle($enabledContent.children(".action-risk-inventory"), inventoryRisk > 0);
                    if (inventoryRisk > 0) 
                        $enabledContent.children(".action-risk-inventory").children(".action-risk-value").text(UIConstants.roundValue((inventoryRiskBase + inventoryRiskVision) * 100, true, true));
                    
                    this.uiFunctions.toggle($enabledContent.children(".action-risk-fight"), fightRisk > 0);
                    if (fightRisk > 0) 
                        $enabledContent.children(".action-risk-fight").children(".action-risk-value").text(UIConstants.roundValue((fightRiskBase + fightRiskVision) * 100, true, true));
                }
            } else {
                this.uiFunctions.toggle($enabledContent, false);
                this.uiFunctions.toggle($disabledContent, true);
                $disabledContent.children(".btn-disabled-reason").html(disabledReason);
            }

            // Check requirements affecting req-cooldown
            bottleNeckCostFraction = Math.min(bottleNeckCostFraction, playerActionsHelper.checkRequirements(action, false, sectorEntity).value);
            if (hasCostBlockers) bottleNeckCostFraction = 0;
            if (isHardDisabled) bottleNeckCostFraction = 0;

            // Update cooldown overlays
            $button.siblings(".cooldown-reqs").css("width", ((bottleNeckCostFraction) * 100) + "%");
            $button.children(".cooldown-duration").css("display", !isHardDisabled ? "inherit" : "none");
        },
        
        hasButtonCooldown: function ($button) {
            return ($button.attr("data-hasCooldown") === "true");
        },
			
        hasButtonDuration: function (button) {
            return ($(button).attr("data-isInProgress") === "true");
        },

        isButtonDisabledVision: function (button) {
            var action = $(button).attr("action");
            if (action) {
                var playerVision = this.playerStatsNodes.head.vision.value;
                var requirements = this.playerActions.playerActionsHelper.getReqs(action);
                if (requirements && requirements.vision) return (playerVision < requirements.vision[0]);
            }
            return false;
        },
            
        isButtonDisabled: function (button) {
            var $button = $(button);
            if ($button.hasClass("btn-meta")) return false;

            if ($button.attr("data-type") === "minus") {
                var input = $button.siblings("input");
                return parseInt(input.val()) <= parseInt(input.attr("min"));
            }

            if ($button.attr("data-type") === "plus") {
                var input = $button.siblings("input");
                return parseInt(input.val()) >= parseInt(input.attr("max"));
            }

            if (!($button.hasClass("action"))) return false;

            var action = $button.attr("action");
            if (!action) return false;

            var sectorEntity = this.buttonHelper.getButtonSectorEntity($button);
            return this.playerActions.playerActionsHelper.checkRequirements(action, false, sectorEntity).value < 1;
        },

        isButtonDisabledResources: function (button) {
            var action = $(button).attr("action");
            return this.playerActions.playerActionsHelper.checkCosts(action, false) < 1;
        },
        
        updateProgressbars: function () {
            for (var i = 0; i < this.elementsVisibleProgressbars.length; i++) {
                var $progressbar = $(this.elementsVisibleProgressbars[i]);
                var isAnimated = $progressbar.data("animated") === true;
                if (!isAnimated) {
                    $progressbar.data("animated", true);
                    var percent = ($progressbar.data('progress-percent') / 100);
                    var animationLength = $progressbar.data("animation-counter") > 0 ? ($progressbar.data('animation-length')) : 0;
                    var progressWrapWidth = $progressbar.width();
                    var progressWidth = percent * progressWrapWidth;
                    $progressbar.children(".progress-bar").stop().animate({ left: progressWidth}, animationLength, function() {
                        $(this).parent().data("animated", false);
                        $(this).parent().data("animation-counter", $progressbar.parent().data("animation-counter") + 1);
                    });
                } else {
                    $progressbar.data("animation-counter", 0);
                }
            }
        },
        
        updateTabVisibility: function () {
            if (!this.playerStatsNodes.head) return;
            var levelCamp = this.nearestCampNodes.head;
            var currentCamp = levelCamp ? levelCamp.entity : null;
            var isInCamp = this.playerStatsNodes.head && this.playerStatsNodes.head.entity.get(PositionComponent).inCamp;
            var hasMap = this.playerStatsNodes.head.entity.get(ItemsComponent).getCountById(ItemConstants.itemDefinitions.uniqueEquipment[0].id, true) > 0;
            var hasProjects = this.gameState.unlockedFeatures.projects;
            var hasTradingPost = currentCamp && currentCamp.get(SectorImprovementsComponent).getCount(improvementNames.tradepost) > 0;
            
            this.uiFunctions.tabToggleIf("#switch-tabs #switch-in", null, isInCamp, 200, 0);
            this.uiFunctions.tabToggleIf("#switch-tabs #switch-upgrades", null, isInCamp && this.gameState.unlockedFeatures.upgrades, 100, 0);
            this.uiFunctions.tabToggleIf("#switch-tabs #switch-blueprints", null, this.gameState.unlockedFeatures.blueprints, 100, 0);
            this.uiFunctions.tabToggleIf("#switch-tabs #switch-world", null, isInCamp && this.gameState.numCamps > 1, 100, 0);
            this.uiFunctions.tabToggleIf("#switch-tabs #switch-bag", null, this.gameState.unlockedFeatures.bag, 100, 0);
            this.uiFunctions.tabToggleIf("#switch-tabs #switch-followers", null, this.gameState.unlockedFeatures.followers, 100, 0);
            this.uiFunctions.tabToggleIf("#switch-tabs #switch-out", null, true, 100, 0);
            this.uiFunctions.tabToggleIf("#switch-tabs #switch-map", null, hasMap, 100, 0);
            this.uiFunctions.tabToggleIf("#switch-tabs #switch-trade", null, isInCamp && hasTradingPost, 100, 0);
            this.uiFunctions.tabToggleIf("#switch-tabs #switch-projects", null, isInCamp && hasProjects, 100, 0);
        },        
        
        updateButtonContainer: function (button, isVisible) {
            $(button).siblings(".cooldown-reqs").css("display", isVisible ? "block" : "none");
            var container = $(button).parent().parent(".callout-container");
            if (container) {
                $(container).css("display", $(button).css("display"));
            }
        },
        
        updateVisibleButtonsList: function () {
            this.elementsVisibleButtons = [];
            var sys = this;
            $.each($("button.action"), function () {
                var $button = $(this);
                var isVisible = (sys.uiFunctions.isElementToggled($button) !== false) && sys.uiFunctions.isElementVisible($button);
                sys.updateButtonContainer($button, isVisible);
                if (isVisible) {
                    sys.elementsVisibleButtons.push($button);
                }
            });
        },
        
        updateVisibleProgressbarsList: function () {
            this.elementsVisibleProgressbars = [];
            var sys = this;
            $.each($(".progress-wrap"), function () {
                var $progressbar = $(this);
                if ($progressbar.is(":visible")) {
                    sys.elementsVisibleProgressbars.push($progressbar);
                } else {
                    $progressbar.data("animation-counter", 0);
                }
            });
        },
        
        updateTabs: function () {
            var posHasCamp = this.currentLocationNodes.head != null && this.currentLocationNodes.head.entity.has(CampComponent);
            var levelCamp = this.nearestCampNodes.head;
            var currentCamp = levelCamp ? levelCamp.entity : null;
            if (currentCamp) {
				var campComponent = currentCamp.get(CampComponent);
				$("#switch-tabs #switch-in .name").text(campComponent.getType());
				$("#switch-tabs #switch-in").toggleClass("disabled", !posHasCamp);
				$("#switch-tabs #switch-world").toggleClass("disabled", !posHasCamp);
            }
        },
        
        updateInfoCallouts: function () {
            var targets;
            var uiFunctions = this.uiFunctions;
            $.each(this.elementsCalloutContainers, function () {
                targets = $(this).children(".info-callout-target");
				if (targets.length > 0) {
					var visible = true;
					$.each(targets.children(), function () {
						visible = visible && $(this).css("display") !== "none";
					});
					uiFunctions.toggle($(this), visible);
				}
            });
        },
    });

    return UIOutElementsSystem;
});
