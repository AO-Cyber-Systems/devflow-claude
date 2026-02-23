class CreateInitialTables < ActiveRecord::Migration[8.0]
  def change
    create_table :projects do |t|
      t.string :name, null: false
      t.string :path, null: false
      t.text :notes
      t.timestamps
      t.index [:path], unique: true
    end

    create_table :env_templates do |t|
      t.string :name, null: false
      t.text :content, null: false
      t.text :description
      t.timestamps
      t.index [:name], unique: true
    end

    create_table :settings do |t|
      t.string :key, null: false
      t.text :value
      t.timestamps
      t.index [:key], unique: true
    end
  end
end
