require "discourse_api"
require './generators/config.rb'

client = DiscourseApi::Client.new(@discourse[:url])
client.api_key = @discourse[:key]
client.api_username = @discourse[:user] 

# Download latest topics
topics = {:topics => client.latest_topics}.to_json
puts topics
