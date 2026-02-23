require "rexml/document"

module PumaDev
  class Config
    PLIST_PATH = File.expand_path("~/Library/LaunchAgents/io.puma.dev.plist")
    LABEL = "io.puma.dev"

    attr_reader :tlds, :dir, :timeout_duration, :http_port, :https_port, :dns_port

    def initialize(attrs = {})
      @tlds = attrs[:tlds] || ["test"]
      @dir = attrs[:dir] || File.expand_path("~/.puma-dev")
      @timeout_duration = attrs[:timeout_duration] || "15m0s"
      @http_port = attrs[:http_port]
      @https_port = attrs[:https_port]
      @dns_port = attrs[:dns_port]
    end

    def self.current
      return new unless plist_exists?

      xml = File.read(PLIST_PATH)
      doc = REXML::Document.new(xml)

      args = parse_program_arguments(doc)
      ports = parse_sockets(doc)

      tlds = extract_flag(args, "-d")&.split(":") || ["test"]
      dir = extract_flag(args, "-dir") || File.expand_path("~/.puma-dev")
      timeout = extract_flag(args, "-timeout") || "15m0s"

      new(
        tlds: tlds,
        dir: dir,
        timeout_duration: timeout,
        http_port: ports[:http],
        https_port: ports[:https],
        dns_port: ports[:dns]
      )
    end

    def self.plist_exists?
      File.exist?(PLIST_PATH)
    end

    def plist_exists?
      self.class.plist_exists?
    end

    def primary_tld
      tlds.first || "test"
    end

    def running?
      result = CommandExecutor.run("launchctl", "list", LABEL)
      result[:success]
    end

    def start!
      CommandExecutor.run("launchctl", "load", "-w", PLIST_PATH)
    end

    def stop!
      CommandExecutor.run("launchctl", "unload", PLIST_PATH)
    end

    def restart!
      stop!
      sleep(0.5)
      start!
    end

    def stop_all!
      CommandExecutor.run("puma-dev", "-stop")
    end

    def ssl_status
      PumaDevApp.ssl_status
    end

    def resolver_status
      tlds.each_with_object({}) do |tld, hash|
        path = "/etc/resolver/#{tld}"
        hash[tld] = File.exist?(path)
      end
    end

    def update_tld!(new_tld_string)
      return unless plist_exists?

      xml = File.read(PLIST_PATH)
      doc = REXML::Document.new(xml)
      update_flag_in_plist(doc, "-d", new_tld_string)
      write_plist(doc)
      @tlds = new_tld_string.split(":")
    end

    def update_timeout!(duration)
      return unless plist_exists?

      xml = File.read(PLIST_PATH)
      doc = REXML::Document.new(xml)
      update_flag_in_plist(doc, "-timeout", duration)
      write_plist(doc)
      @timeout_duration = duration
    end

    def setup_commands(tld_string)
      [
        "sudo puma-dev -setup -d #{tld_string}",
      ]
    end

    def cert_path
      File.expand_path("~/Library/Application Support/io.puma.dev/cert.pem")
    end

    def cert_expires
      ssl = ssl_status
      ssl[:installed] ? ssl[:expires] : nil
    end

    private

    def self.parse_program_arguments(doc)
      args = []
      in_program_args = false
      in_array = false

      doc.root.each_element("//dict") do |dict|
        dict.elements.each do |el|
          if el.name == "key" && el.text == "ProgramArguments"
            in_program_args = true
            next
          end

          if in_program_args && el.name == "array"
            el.elements.each("string") { |s| args << s.text }
            in_program_args = false
            break
          end
        end
        break if args.any?
      end

      args
    end

    def self.parse_sockets(doc)
      ports = { http: nil, https: nil, dns: nil }

      doc.root.each_element("//dict") do |dict|
        dict.elements.each do |el|
          if el.name == "key" && el.text == "Sockets"
            socket_dict = el.next_element
            next unless socket_dict&.name == "dict"

            current_key = nil
            socket_dict.elements.each do |sock_el|
              if sock_el.name == "key"
                current_key = sock_el.text
              elsif sock_el.name == "dict" && current_key
                sock_el.elements.each do |inner|
                  if inner.name == "key" && inner.text == "SockNodeName"
                    port_el = inner.next_element
                    # Skip SockNodeName value, look for SockServiceName
                  elsif inner.name == "key" && inner.text == "SockServiceName"
                    val_el = inner.next_element
                    if val_el
                      port = val_el.text
                      case current_key
                      when "Listeners" then ports[:http] = port
                      when "TLSListeners" then ports[:https] = port
                      end
                    end
                  end
                end
                current_key = nil
              end
            end
          end
        end
      end

      # DNS port from ProgramArguments -dns-port flag
      args = parse_program_arguments(doc)
      dns_port = extract_flag(args, "-dns-port")
      ports[:dns] = dns_port if dns_port

      ports
    end

    def self.extract_flag(args, flag)
      idx = args.index(flag)
      return nil unless idx
      args[idx + 1]
    end

    def update_flag_in_plist(doc, flag, value)
      # Find the ProgramArguments array
      doc.root.each_element("//dict") do |dict|
        dict.elements.each do |el|
          if el.name == "key" && el.text == "ProgramArguments"
            array_el = el.next_element
            next unless array_el&.name == "array"

            strings = array_el.get_elements("string")
            flag_idx = strings.index { |s| s.text == flag }

            if flag_idx && strings[flag_idx + 1]
              strings[flag_idx + 1].text = value
            end
            return
          end
        end
      end
    end

    def write_plist(doc)
      output = ""
      formatter = REXML::Formatters::Pretty.new(2)
      formatter.compact = true
      formatter.write(doc, output)
      File.write(PLIST_PATH, output)
    end
  end
end
