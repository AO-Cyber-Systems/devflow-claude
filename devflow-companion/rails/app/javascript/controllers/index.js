import { application } from "controllers/application"

import PollingController from "controllers/polling_controller"
application.register("polling", PollingController)

import SecretToggleController from "controllers/secret_toggle_controller"
application.register("secret-toggle", SecretToggleController)

import OauthFlowController from "controllers/oauth_flow_controller"
application.register("oauth-flow", OauthFlowController)

import MailTabsController from "controllers/mail_tabs_controller"
application.register("mail-tabs", MailTabsController)
