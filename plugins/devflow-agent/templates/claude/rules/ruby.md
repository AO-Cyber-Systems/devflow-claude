---
paths:
  - "**/*.rb"
  - "**/*.erb"
  - "Gemfile"
  - "Rakefile"
---

# Ruby / Rails Conventions

## Project Structure (Rails)
```
app/
├── controllers/      # Request handlers
├── models/           # ActiveRecord models
├── views/            # ERB templates
├── services/         # Business logic (PORO)
├── jobs/             # Background jobs
├── mailers/          # Email handlers
└── helpers/          # View helpers
```

## Controllers
```ruby
class ItemsController < ApplicationController
  before_action :authenticate_user!
  before_action :set_item, only: [:show, :update, :destroy]

  def index
    @items = Item.where(user: current_user).page(params[:page])
    render json: @items
  end

  def create
    @item = Item.new(item_params)
    @item.user = current_user

    if @item.save
      render json: @item, status: :created
    else
      render json: { errors: @item.errors }, status: :unprocessable_entity
    end
  end

  private

  def set_item
    @item = Item.find(params[:id])
  end

  def item_params
    params.require(:item).permit(:name, :price)
  end
end
```

## Models
```ruby
class Item < ApplicationRecord
  belongs_to :user
  has_many :tags, dependent: :destroy

  validates :name, presence: true, length: { maximum: 100 }
  validates :price, numericality: { greater_than: 0 }

  scope :active, -> { where(active: true) }
  scope :recent, -> { order(created_at: :desc) }
end
```

## Service Objects
Use service objects for complex business logic:
```ruby
class CreateItemService
  def initialize(user:, params:)
    @user = user
    @params = params
  end

  def call
    item = @user.items.build(@params)

    ActiveRecord::Base.transaction do
      item.save!
      notify_created(item)
    end

    Result.success(item)
  rescue ActiveRecord::RecordInvalid => e
    Result.failure(e.record.errors)
  end
end
```

## Background Jobs
```ruby
class ProcessItemJob < ApplicationJob
  queue_as :default
  retry_on StandardError, wait: :exponentially_longer, attempts: 3

  def perform(item_id)
    item = Item.find(item_id)
    # Process item
  end
end
```

## Testing (RSpec)
```ruby
RSpec.describe Item, type: :model do
  describe "validations" do
    it { is_expected.to validate_presence_of(:name) }
    it { is_expected.to validate_numericality_of(:price).is_greater_than(0) }
  end

  describe "#active" do
    it "returns only active items" do
      active = create(:item, active: true)
      inactive = create(:item, active: false)

      expect(Item.active).to contain_exactly(active)
    end
  end
end
```

## Style
- Use `rubocop` for linting
- Prefer `frozen_string_literal: true`
- Use keyword arguments for methods with 3+ params
- Avoid N+1 queries (use `includes`)
