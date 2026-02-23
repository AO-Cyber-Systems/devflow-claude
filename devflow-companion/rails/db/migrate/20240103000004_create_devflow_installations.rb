class CreateDevflowInstallations < ActiveRecord::Migration[8.1]
  def change
    create_table :devflow_installations do |t|
      t.string :config_dir, null: false
      t.string :scope, null: false
      t.string :version
      t.string :status, default: "installed"
      t.json :file_manifest
      t.json :local_patches
      t.datetime :installed_at
      t.datetime :updated_at_version

      t.timestamps
    end

    add_index :devflow_installations, :config_dir, unique: true
  end
end
