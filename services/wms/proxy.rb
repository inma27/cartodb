# encoding: utf-8
require 'nokogiri'
require 'typhoeus'

module CartoDB
  module WMS
    class Proxy
      SERVER_XPATH  = "//OnlineResource[1]"
      FORMATS_XPATH = "//GetMap/Format"
      LAYERS_XPATH  = "//Layer[@queryable=1][BoundingBox]/Title"

      def initialize(url, preloaded_xml=nil)
        @url        = url
        @response   = preloaded_xml
      end

      def serialize
        run
        { server: server, formats: formats, layers: layers }
      end

      def run
        request_capabilities unless response
        self
      end 

      def request_capabilities
        @response = Typhoeus.get(url).response_body
        nil
      end 

      def document
        Nokogiri::XML::Document.parse(response).remove_namespaces!
      end

      def server
        document.at_xpath(SERVER_XPATH)['href']
      end

      def formats
        document.xpath(FORMATS_XPATH).map(&:text)
      end

      def layers

        document.xpath(LAYERS_XPATH).map { |element| 
          { 
            name:         element.xpath("//Name").first.text,
            title:        element.xpath("//Title").first.text,
            attribution:  nil
          } 
        }
      end

      attr_reader :response

      private
      
      attr_reader :url
    end # Proxy
  end # WMS
end # CartoDB

