import { application } from "controllers/application"

import PollingController from "controllers/polling_controller"
application.register("polling", PollingController)

import SecretToggleController from "controllers/secret_toggle_controller"
application.register("secret-toggle", SecretToggleController)

import OauthFlowController from "controllers/oauth_flow_controller"
application.register("oauth-flow", OauthFlowController)

import MailTabsController from "controllers/mail_tabs_controller"
application.register("mail-tabs", MailTabsController)

import UpdateBannerController from "controllers/update_banner_controller"
application.register("update-banner", UpdateBannerController)

import PrereqInstallController from "controllers/prereq_install_controller"
application.register("prereq-install", PrereqInstallController)

import PackageSearchController from "controllers/package_search_controller"
application.register("package-search", PackageSearchController)

import PackageActionController from "controllers/package_action_controller"
application.register("package-action", PackageActionController)
