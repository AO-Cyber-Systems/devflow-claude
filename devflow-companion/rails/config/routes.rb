Rails.application.routes.draw do
  # Health check for Electron startup
  get "health", to: "health#show"

  # Setup wizard
  resource :setup, only: [:show] do
    post :update_step
  end

  # Prerequisites
  resources :prerequisites, only: [:index] do
    collection do
      get :results
      post :recheck
      post :dismiss
    end
  end

  # Claude proxy (transparent forwarding)
  namespace :claude do
    post "v1/messages", to: "proxy#messages"
  end

  # Dashboard
  root "dashboard#index"

  # Projects
  resources :projects, only: [:index, :create, :destroy] do
    member do
      post :activate
      post :onboard
    end
  end

  # Infrastructure
  resources :services, only: [:index] do
    member do
      post :start
      post :stop
      post :restart
    end
  end

  namespace :puma_dev do
    resources :apps, only: [:index, :create, :destroy] do
      member do
        post :restart
      end
      collection do
        get :logs
      end
    end
    resource :config, only: [:show, :update]
  end

  resources :mail_messages, only: [:index, :show, :destroy], path: "mail" do
    collection do
      delete :destroy_all
    end
    member do
      get :body
      post :toggle_read
    end
  end

  resources :ports, only: [:index] do
    member do
      delete :kill
    end
  end

  resources :hosts, only: [:index, :create, :update, :destroy]

  # Proxy management
  resources :proxy_accounts, only: [:index, :create, :destroy] do
    member do
      post :pause
      post :unpause
      post :test_connection
    end
    collection do
      get :stats
      post :authorize
      get :oauth_status
    end
  end

  # Configuration
  namespace :environments do
    resources :files, only: [:index, :show, :update], param: :path
  end

  resources :ssh_keys, only: [:index] do
    member do
      post :add_to_agent
    end
  end

  resource :git_config, only: [:show, :update]

  # Claude Code Management
  namespace :claude_code do
    resource :settings, only: [:show, :update]
    resources :hooks, only: [:index, :create, :update, :destroy]
    resources :mcp_servers, only: [:index, :create, :destroy]
    resources :plugins, only: [:index] do
      member do
        post :toggle
      end
    end
    resource :permissions, only: [:show, :update]
  end

  # DevFlow Integration
  namespace :devflow do
    resource :dashboard, only: [:show]
    resource :settings, only: [:show, :update]
    resource :context, only: [:show]
    resource :updates, only: [] do
      get :check, on: :collection
      post :apply, on: :collection
    end
  end

  # API for tray
  namespace :api do
    resource :tray_status, only: [:show] do
      post :service_action
      post :puma_dev_restart
      post :quick_action
    end
  end
end
