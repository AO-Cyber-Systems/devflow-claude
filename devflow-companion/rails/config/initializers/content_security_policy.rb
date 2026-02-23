# Allow everything from self since we're running in Electron
Rails.application.configure do
  config.content_security_policy do |policy|
    policy.default_src :self
    policy.font_src    :self
    policy.img_src     :self, :data
    policy.object_src  :none
    policy.script_src  :self, :unsafe_inline
    policy.style_src   :self, :unsafe_inline
    policy.connect_src :self
  end
end
